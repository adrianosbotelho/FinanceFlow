import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { countBusinessDaysBetween } from "../../../lib/business-days";
import { resolveCdiAnnualReferenceWithSource } from "../../../lib/cdi-reference";
import {
  CashFlow,
  daysBetween,
  estimateInvestmentRedemption,
  parseLiquidity,
} from "../../../lib/redemption-tax";
import {
  LiquidityBucket,
  LiquidityBucketKey,
  LiquidityInvestmentItem,
  LiquidityPayload,
} from "../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type InvestmentRow = {
  id: string;
  type: string;
  institution: string;
  name: string;
  amount_invested: number | string | null;
  cdi_rate: number | string | null;
  start_date: string | null;
  liquidity: string | null;
  maturity_date: string | null;
};
type ReturnRow = { investment_id: string; year: number; month: number; income_value: number | string | null };
type CashEventRow = { investment_id: string; event_date: string | null; type: string; amount: number | string | null };

const BUCKETS: Array<{ key: LiquidityBucketKey; label: string }> = [
  { key: "d0", label: "Disponível já (D+0/D+1)" },
  { key: "ate30", label: "Em até 30 dias" },
  { key: "ate90", label: "Em 31 a 90 dias" },
  { key: "ate365", label: "Em 91 dias a 1 ano" },
  { key: "acima365", label: "Acima de 1 ano" },
  { key: "nao_informada", label: "Liquidez não informada" },
];

// Faixas da tabela regressiva de IR (dias corridos).
const TAX_BRACKETS = [
  { upTo: 180, ratePercent: 20 },
  { upTo: 360, ratePercent: 17.5 },
  { upTo: 720, ratePercent: 15 },
];

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getSaoPauloToday(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parseIsoDate(iso)!;
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function bucketFor(days: number | null): LiquidityBucketKey {
  if (days === null) return "nao_informada";
  if (days <= 1) return "d0";
  if (days <= 30) return "ate30";
  if (days <= 90) return "ate90";
  if (days <= 365) return "ate365";
  return "acima365";
}

function liquidityLabel(kind: LiquidityItemKind, days: number | null, raw: string | null): string {
  if (kind === "diaria") return days && days > 0 ? `Diária (D+${days})` : "Diária";
  if (kind === "prazo") return `D+${days}`;
  if (kind === "vencimento") return "Só no vencimento";
  return raw ? `Não reconhecida ("${raw}")` : "Não informada";
}

type LiquidityItemKind = LiquidityInvestmentItem["liquidityKind"];

export async function GET() {
  const today = getSaoPauloToday();
  const warnings: string[] = [];

  const [investmentsRes, returnsRes, eventsRes, cdiReference] = await Promise.all([
    supabase
      .from("investments")
      .select("id,type,institution,name,amount_invested,cdi_rate,start_date,liquidity,maturity_date"),
    supabase.from("monthly_returns").select("investment_id,year,month,income_value"),
    supabase.from("investment_cash_events").select("investment_id,event_date,type,amount"),
    resolveCdiAnnualReferenceWithSource(),
  ]);
  const failed = [investmentsRes, returnsRes, eventsRes].find((res) => res.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const investments = ((investmentsRes.data ?? []) as InvestmentRow[]).filter(
    (inv) => inv.type === "CDB" && toNumber(inv.amount_invested) > 0,
  );
  const returns = (returnsRes.data ?? []) as ReturnRow[];
  const events = (eventsRes.data ?? []) as CashEventRow[];
  const cdiDaily = Math.pow(1 + cdiReference.value / 100, 1 / 252) - 1;

  const items: LiquidityInvestmentItem[] = investments.map((inv) => {
    const balance = toNumber(inv.amount_invested);
    const incomeRows = returns.filter((row) => row.investment_id === inv.id);
    const totalIncome = incomeRows.reduce((acc, row) => acc + toNumber(row.income_value), 0);
    const firstIncome = incomeRows
      .filter((row) => toNumber(row.income_value) > 0)
      .map((row) => new Date(Number(row.year), Number(row.month) - 1, 1))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const flows: CashFlow[] = events
      .filter((event) => event.investment_id === inv.id)
      .map((event) => {
        const type = String(event.type ?? "").toUpperCase();
        const date = parseIsoDate(event.event_date);
        if (!date || (type !== "APORTE" && type !== "RESGATE")) return null;
        return { date, amount: type === "APORTE" ? toNumber(event.amount) : -toNumber(event.amount) };
      })
      .filter((flow): flow is CashFlow => flow !== null);

    const startDate = parseIsoDate(inv.start_date);
    const redemption = estimateInvestmentRedemption({
      balance,
      totalIncome,
      firstIncomeDate: firstIncome ?? null,
      startDate,
      flows,
      at: today,
    });
    if (redemption.inconsistentIncome) {
      warnings.push(`${inv.name}: renda lançada maior que o saldo; IR estimado sobre o saldo sem rendimento.`);
    }
    if (redemption.inconsistentFlows) {
      warnings.push(`${inv.name}: aportes lançados maiores que o principal; revise os eventos de caixa.`);
    }
    const taxToday = redemption.tax;
    const gain = taxToday.gain;


    // Próxima redução de alíquota (o lote principal, pelo peso, define quando a taxa efetiva cai).
    const mainLot = taxToday.lots.slice().sort((a, b) => b.gain - a.gain)[0];
    const bracket = mainLot ? TAX_BRACKETS.find((item) => mainLot.days <= item.upTo) : undefined;
    const nextTaxBracket =
      mainLot && bracket ? { ratePercent: bracket.ratePercent, inDays: bracket.upTo - mainLot.days + 1 } : null;

    const liquidity = parseLiquidity(inv.liquidity);
    const maturity = parseIsoDate(inv.maturity_date);
    const daysToMaturity = maturity ? daysBetween(today, maturity) : null;
    const maturityPassed = maturity !== null && maturity < today;
    const availableInDays =
      liquidity.kind === "diaria" || liquidity.kind === "prazo"
        ? liquidity.days
        : liquidity.kind === "vencimento"
          ? daysToMaturity
          : null;

    // Valor projetado no vencimento: saldo rendendo o % do CDI contratado até lá.
    const contractedCdiPercent = toNumber(inv.cdi_rate) > 0 ? toNumber(inv.cdi_rate) : null;
    let maturityGrossValue: number | null = null;
    let maturityNetValue: number | null = null;
    if (maturity && !maturityPassed) {
      const businessDays = countBusinessDaysBetween(today, maturity);
      const daily = cdiDaily * ((contractedCdiPercent ?? 100) / 100);
      const futureGain = balance * (Math.pow(1 + daily, businessDays) - 1);
      maturityGrossValue = balance + futureGain;
      maturityNetValue = estimateInvestmentRedemption({
        balance,
        totalIncome,
        firstIncomeDate: firstIncome ?? null,
        startDate,
        flows,
        at: maturity,
        extraGain: futureGain,
      }).tax.net;
    }

    const missing: LiquidityInvestmentItem["missing"] = [];
    if (!startDate) missing.push("start_date");
    if (!maturity) missing.push("maturity_date");
    if (liquidity.kind === "nao_informada") missing.push("liquidity");

    return {
      investmentId: inv.id,
      label: inv.name,
      institution: inv.institution,
      balance,
      principal: taxToday.principal,
      gain: taxToday.gain,
      iof: taxToday.iof,
      incomeTax: taxToday.incomeTax,
      net: taxToday.net,
      effectiveTaxRatePercent: taxToday.effectiveRatePercent,
      averageDaysInvested: taxToday.averageDays,
      nextTaxBracket,
      hasEstimatedDates: taxToday.hasEstimatedDates,
      liquidityLabel: liquidityLabel(liquidity.kind, liquidity.days, inv.liquidity),
      liquidityKind: liquidity.kind,
      availableInDays,
      bucket: bucketFor(availableInDays),
      maturityDate: maturity ? toIso(maturity) : null,
      daysToMaturity: maturityPassed ? 0 : daysToMaturity,
      contractedCdiPercent,
      maturityGrossValue,
      maturityNetValue,
      missing,
    };
  });

  for (const item of items) {
    if (item.maturityDate && item.daysToMaturity === 0) {
      warnings.push(`${item.label}: vencimento já passou; atualize a data ou registre o resgate.`);
    }
  }

  const buckets: LiquidityBucket[] = BUCKETS.map((bucket) => {
    const inBucket = items.filter((item) => item.bucket === bucket.key);
    return {
      key: bucket.key,
      label: bucket.label,
      gross: inBucket.reduce((acc, item) => acc + item.balance, 0),
      net: inBucket.reduce((acc, item) => acc + item.net, 0),
    };
  });

  const gross = items.reduce((acc, item) => acc + item.balance, 0);
  const iof = items.reduce((acc, item) => acc + item.iof, 0);
  const incomeTax = items.reduce((acc, item) => acc + item.incomeTax, 0);
  const totalGain = items.reduce((acc, item) => acc + item.gain, 0);
  const maturingSoon = items.filter((item) => item.daysToMaturity !== null && item.daysToMaturity <= 90);

  const payload: LiquidityPayload = {
    generatedAt: new Date().toISOString(),
    today: toIso(today),
    cdiAnnualRatePct: cdiReference.value,
    summary: {
      gross,
      iof,
      incomeTax,
      net: gross - iof - incomeTax,
      effectiveTaxRatePercent: totalGain > 0 ? ((iof + incomeTax) / totalGain) * 100 : null,
      availableNowNet: buckets.find((bucket) => bucket.key === "d0")?.net ?? 0,
      maturingIn90DaysGross: maturingSoon.reduce((acc, item) => acc + item.balance, 0),
      maturingIn90DaysCount: maturingSoon.length,
    },
    buckets,
    investments: items.sort((a, b) => (a.availableInDays ?? 99999) - (b.availableInDays ?? 99999)),
    warnings,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
