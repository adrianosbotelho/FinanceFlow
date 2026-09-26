import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { resolveMonthlyCdiHistory } from "../../../lib/cdi-reference";
import { formatCurrencyBRL } from "../../../lib/formatters";
import {
  PerformanceInstitutionItem,
  PerformanceInvestmentItem,
  PerformanceMonthPoint,
  PerformancePayload,
} from "../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BCB_IPCA_MONTHLY_SERIES_CODE = 433;
const IPCA_FETCH_TIMEOUT_MS = 5000;
// IR estimado com a alíquota mínima da tabela regressiva (aplicações com mais de 720 dias).
const ESTIMATED_TAX_RATE_PERCENT = 15;
// Garantia do FGC por CPF e por instituição (conglomerado).
const FGC_LIMIT = 250_000;

type InvestmentRow = {
  id: string;
  type: string;
  institution: string;
  name: string;
  amount_invested: number | string | null;
  cdi_rate: number | string | null;
};

type ReturnRow = { investment_id: string; year: number; month: number; income_value: number | string | null };
type CashEventRow = { investment_id: string; year: number; month: number; type: string; amount: number | string | null };
type MacroRow = { month: number; inflation_rate: number | string | null };
type BcbSeriesPoint = { data?: string; valor?: string };

type CdbContext = {
  id: string;
  label: string;
  institution: string;
  balanceNow: number;
  contractedCdiPercent: number | null;
  firstIncomeYm: number | null;
  incomeByYm: Map<number, number>;
  flowByYm: Map<number, number>;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ym(year: number, month: number): number {
  return year * 100 + month;
}

function previousYm(value: number): number {
  const year = Math.floor(value / 100);
  const month = value % 100;
  return month === 1 ? ym(year - 1, 12) : value - 1;
}

function isMissingTableError(error: { message?: string; code?: string } | null, table: string): boolean {
  if (!error) return false;
  return error.code === "42P01" || Boolean(error.message?.includes(table));
}

function getSaoPauloYearMonth(reference = new Date()): { year: number; month: number } {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(reference)
    .split("-")
    .map(Number);
  return { year, month };
}

// O BCB usa ponto como separador decimal ("0.33"); não há separador de milhar nessas séries.
function parseBcbValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchBcbMonthlyInflation(
  year: number,
): Promise<{ rates: Map<number, number>; warning: string | null }> {
  const label = `BCB IPCA (SGS ${BCB_IPCA_MONTHLY_SERIES_CODE})`;
  try {
    const params = new URLSearchParams({
      formato: "json",
      dataInicial: `01/01/${year}`,
      dataFinal: `31/12/${year}`,
    });
    const response = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_IPCA_MONTHLY_SERIES_CODE}/dados?${params.toString()}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(IPCA_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) return { rates: new Map(), warning: `${label} indisponível (${response.status}).` };

    const payload = (await response.json()) as BcbSeriesPoint[];
    const rates = new Map<number, number>();
    for (const point of Array.isArray(payload) ? payload : []) {
      const [, month, pointYear] = String(point.data ?? "").split("/").map(Number);
      const rate = parseBcbValue(point.valor);
      if (pointYear === year && month >= 1 && month <= 12 && rate !== null) rates.set(month, rate);
    }
    return { rates, warning: rates.size === 0 ? `${label} sem dados para ${year}.` : null };
  } catch {
    return { rates: new Map(), warning: `Falha ao consultar ${label} para ${year}.` };
  }
}

function sumAfter(values: Map<number, number>, afterYm: number): number {
  let total = 0;
  for (const [key, value] of Array.from(values.entries())) {
    if (key > afterYm) total += value;
  }
  return total;
}

// Saldo no fim da competência: saldo atual − aportes/resgates e renda lançados depois dela.
// Antes do mês de estreia (primeira renda) o investimento ainda não existia.
function closingBalance(ctx: CdbContext, atYm: number): number {
  if (ctx.firstIncomeYm === null || atYm < ctx.firstIncomeYm) return 0;
  return Math.max(0, ctx.balanceNow - sumAfter(ctx.flowByYm, atYm) - sumAfter(ctx.incomeByYm, atYm));
}

// Rentabilidade do mês sobre o saldo de abertura + metade do fluxo do mês (aproximação de Dietz).
// O mês de estreia fica fora por ser parcial.
function monthReturn(contexts: CdbContext[], atYm: number): number | null {
  let income = 0;
  let base = 0;
  for (const ctx of contexts) {
    if (ctx.firstIncomeYm === null || atYm <= ctx.firstIncomeYm) continue;
    income += ctx.incomeByYm.get(atYm) ?? 0;
    base += closingBalance(ctx, previousYm(atYm)) + (ctx.flowByYm.get(atYm) ?? 0) / 2;
  }
  return base > 0 ? (income / base) * 100 : null;
}

function compound(percents: Array<number | null>): number | null {
  const valid = percents.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return (valid.reduce((acc, value) => acc * (1 + value / 100), 1) - 1) * 100;
}

function normalizeInstitution(value: string): string {
  const trimmed = value.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = getSaoPauloYearMonth();
  const yearParam = Number(searchParams.get("year") ?? now.year);
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= now.year ? yearParam : now.year;
  const currentYm = ym(now.year, now.month);
  const warnings: string[] = [];

  const [investmentsRes, returnsRes, cashEventsRes, macroRes, cdiHistory, ipcaRes] = await Promise.all([
    supabase.from("investments").select("id,type,institution,name,amount_invested,cdi_rate"),
    supabase.from("monthly_returns").select("investment_id,year,month,income_value"),
    supabase.from("investment_cash_events").select("investment_id,year,month,type,amount"),
    supabase.from("monthly_macro").select("month,inflation_rate").eq("year", year),
    resolveMonthlyCdiHistory(year),
    fetchBcbMonthlyInflation(year),
  ]);

  if (investmentsRes.error || returnsRes.error) {
    return NextResponse.json(
      { error: (investmentsRes.error ?? returnsRes.error)?.message ?? "Erro ao carregar performance." },
      { status: 500 },
    );
  }
  if (cashEventsRes.error && !isMissingTableError(cashEventsRes.error, "investment_cash_events")) {
    return NextResponse.json({ error: cashEventsRes.error.message }, { status: 500 });
  }
  if (macroRes.error && !isMissingTableError(macroRes.error, "monthly_macro")) {
    return NextResponse.json({ error: macroRes.error.message }, { status: 500 });
  }

  const investments = (investmentsRes.data ?? []) as InvestmentRow[];
  const returns = (returnsRes.data ?? []) as ReturnRow[];
  const cashEvents = (cashEventsRes.data ?? []) as CashEventRow[];

  // Inflação: IPCA do BCB, com sobrescrita manual pela tabela monthly_macro.
  const inflationByMonth = new Map<number, number>(ipcaRes.rates);
  const manualRows = (macroRes.data ?? []) as MacroRow[];
  for (const row of manualRows) {
    if (row.inflation_rate === null || row.inflation_rate === undefined) continue;
    inflationByMonth.set(Number(row.month), toNumber(row.inflation_rate));
  }
  if (ipcaRes.warning) warnings.push(ipcaRes.warning);
  const inflationSource: PerformancePayload["inflationSource"] =
    ipcaRes.rates.size > 0 ? "bcb" : manualRows.length > 0 ? "manual" : "none";
  if (cdiHistory.size === 0) warnings.push("CDI mensal do BCB (SGS 4391) indisponível; comparativo com o CDI omitido.");

  const byId = new Map(investments.map((inv) => [inv.id, inv]));
  const contexts: CdbContext[] = investments
    .filter((inv) => inv.type === "CDB")
    .map((inv) => ({
      id: inv.id,
      label: inv.name,
      institution: normalizeInstitution(inv.institution),
      balanceNow: toNumber(inv.amount_invested),
      contractedCdiPercent: toNumber(inv.cdi_rate) > 0 ? toNumber(inv.cdi_rate) : null,
      firstIncomeYm: null,
      incomeByYm: new Map<number, number>(),
      flowByYm: new Map<number, number>(),
    }));
  const contextById = new Map(contexts.map((ctx) => [ctx.id, ctx]));

  let fiiDividends = 0;
  for (const row of returns) {
    const value = toNumber(row.income_value);
    const key = ym(Number(row.year), Number(row.month));
    const ctx = contextById.get(row.investment_id);
    if (ctx) {
      ctx.incomeByYm.set(key, (ctx.incomeByYm.get(key) ?? 0) + value);
    } else if (byId.get(row.investment_id)?.type === "FII" && Number(row.year) === year) {
      fiiDividends += value;
    }
  }
  for (const event of cashEvents) {
    const ctx = contextById.get(event.investment_id);
    const type = String(event.type ?? "").toUpperCase();
    if (!ctx || (type !== "APORTE" && type !== "RESGATE")) continue;
    const key = ym(Number(event.year), Number(event.month));
    const signed = type === "APORTE" ? toNumber(event.amount) : -toNumber(event.amount);
    ctx.flowByYm.set(key, (ctx.flowByYm.get(key) ?? 0) + signed);
  }
  for (const ctx of contexts) {
    const incomeKeys = Array.from(ctx.incomeByYm.entries())
      .filter(([, value]) => value > 0)
      .map(([key]) => key)
      .sort((a, b) => a - b);
    ctx.firstIncomeYm = incomeKeys[0] ?? null;
  }
  const activeContexts = contexts.filter((ctx) => ctx.balanceNow > 0 || ctx.firstIncomeYm !== null);

  // Série mensal.
  const monthlySeries: PerformanceMonthPoint[] = [];
  const closedReturns: Array<number | null> = [];
  const closedCdi: Array<number | null> = [];
  const closedIpca: Array<number | null> = [];
  let closedThroughMonth: number | null = null;
  let ipcaThroughMonth: number | null = null;
  for (let month = 1; month <= 12; month += 1) {
    const key = ym(year, month);
    const status: PerformanceMonthPoint["status"] =
      key < currentYm ? "closed" : key === currentYm ? "in_progress" : "future";
    if (status === "future") {
      monthlySeries.push({
        month,
        year,
        status,
        closingBalance: null,
        netContributions: 0,
        grossIncome: 0,
        returnPercent: null,
        cdiPercent: null,
        percentOfCdi: null,
        ipcaPercent: null,
        accumulatedReturnPercent: null,
        accumulatedCdiPercent: null,
        accumulatedIpcaPercent: null,
      });
      continue;
    }

    const returnPercent = monthReturn(activeContexts, key);
    const cdiPercent = cdiHistory.get(month) ?? null;
    const ipcaPercent = inflationByMonth.get(month) ?? null;
    if (status === "closed" && returnPercent !== null) {
      closedReturns.push(returnPercent);
      closedCdi.push(cdiPercent);
      closedThroughMonth = month;
      if (ipcaPercent !== null) {
        closedIpca.push(ipcaPercent);
        ipcaThroughMonth = month;
      }
    }

    monthlySeries.push({
      month,
      year,
      status,
      closingBalance: activeContexts.reduce((acc, ctx) => acc + closingBalance(ctx, key), 0),
      netContributions: activeContexts.reduce((acc, ctx) => acc + (ctx.flowByYm.get(key) ?? 0), 0),
      grossIncome: activeContexts.reduce((acc, ctx) => acc + (ctx.incomeByYm.get(key) ?? 0), 0),
      returnPercent,
      cdiPercent,
      percentOfCdi:
        returnPercent !== null && cdiPercent !== null && cdiPercent > 0 ? (returnPercent / cdiPercent) * 100 : null,
      ipcaPercent,
      accumulatedReturnPercent: status === "closed" ? compound(closedReturns) : null,
      accumulatedCdiPercent: status === "closed" ? compound(closedCdi) : null,
      accumulatedIpcaPercent: status === "closed" ? compound(closedIpca) : null,
    });
  }

  // Resumo do ano (rentabilidade só com meses fechados).
  const returnPercent = compound(closedReturns);
  const cdiPercent = compound(closedCdi);
  const ipcaPercent = compound(closedIpca);
  // Ganho real no mesmo período em que o IPCA já foi divulgado.
  const returnThroughIpca =
    ipcaThroughMonth !== null
      ? compound(
          monthlySeries
            .filter((point) => point.status === "closed" && point.month <= ipcaThroughMonth!)
            .map((point) => point.returnPercent),
        )
      : null;
  const realReturnPercent =
    returnThroughIpca !== null && ipcaPercent !== null
      ? ((1 + returnThroughIpca / 100) / (1 + ipcaPercent / 100) - 1) * 100
      : null;
  if (closedThroughMonth !== null && ipcaThroughMonth !== null && ipcaThroughMonth < closedThroughMonth) {
    warnings.push(`IPCA ainda não divulgado após o mês ${ipcaThroughMonth}; o ganho real vai até esse mês.`);
  }

  const yearEndYm = year === now.year ? currentYm : ym(year, 12);
  const currentBalance = activeContexts.reduce(
    (acc, ctx) => acc + (year === now.year ? ctx.balanceNow : closingBalance(ctx, yearEndYm)),
    0,
  );
  const openingBalance = activeContexts.reduce((acc, ctx) => acc + closingBalance(ctx, ym(year - 1, 12)), 0);
  const inYear = (key: number) => key >= ym(year, 1) && key <= yearEndYm;
  const netContributions = activeContexts.reduce(
    (acc, ctx) =>
      acc + Array.from(ctx.flowByYm.entries()).reduce((sum, [key, value]) => sum + (inYear(key) ? value : 0), 0),
    0,
  );
  const grossIncome = activeContexts.reduce(
    (acc, ctx) =>
      acc + Array.from(ctx.incomeByYm.entries()).reduce((sum, [key, value]) => sum + (inYear(key) ? value : 0), 0),
    0,
  );
  // Aplicações iniciais que não foram lançadas como aporte (ex.: abertura de um CDB novo).
  const unrecordedApplications = currentBalance - openingBalance - netContributions - grossIncome;
  if (unrecordedApplications > 1) {
    warnings.push(
      `${formatCurrencyBRL(unrecordedApplications)} em aplicações iniciais não foram lançadas como aporte (investimentos abertos no ano).`,
    );
  }

  // IR estimado sobre toda a renda acumulada ainda aplicada (alíquota fixa de 15%).
  const taxFactor = ESTIMATED_TAX_RATE_PERCENT / 100;
  const accumulatedIncomeUntil = (ctx: CdbContext) =>
    Array.from(ctx.incomeByYm.entries()).reduce((sum, [key, value]) => sum + (key <= yearEndYm ? value : 0), 0);
  const estimatedTaxOnRedemption = activeContexts.reduce(
    (acc, ctx) => acc + accumulatedIncomeUntil(ctx) * taxFactor,
    0,
  );

  // Por investimento.
  const investmentItems: PerformanceInvestmentItem[] = activeContexts
    .map((ctx) => {
      const balance = year === now.year ? ctx.balanceNow : closingBalance(ctx, yearEndYm);
      const monthly = monthlySeries
        .filter((point) => point.status === "closed")
        .map((point) => ({
          ret: monthReturn([ctx], ym(year, point.month)),
          cdi: point.cdiPercent,
        }))
        .filter((point) => point.ret !== null);
      const itemReturn = compound(monthly.map((point) => point.ret));
      const itemCdi = compound(monthly.map((point) => point.cdi));
      const income = Array.from(ctx.incomeByYm.entries()).reduce(
        (sum, [key, value]) => sum + (inYear(key) ? value : 0),
        0,
      );
      return {
        investmentId: ctx.id,
        label: ctx.label,
        institution: ctx.institution,
        balance,
        sharePercent: currentBalance > 0 ? (balance / currentBalance) * 100 : 0,
        grossIncome: income,
        returnPercent: itemReturn,
        percentOfCdi:
          itemReturn !== null && itemCdi !== null && itemCdi > 0 ? (itemReturn / itemCdi) * 100 : null,
        contractedCdiPercent: ctx.contractedCdiPercent,
        estimatedTax: accumulatedIncomeUntil(ctx) * taxFactor,
        returnMonths: monthly.length,
      };
    })
    .filter((item) => item.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // Concentração por instituição e uso do limite do FGC.
  const byInstitution = new Map<string, number>();
  for (const item of investmentItems) {
    byInstitution.set(item.institution, (byInstitution.get(item.institution) ?? 0) + item.balance);
  }
  const institutions: PerformanceInstitutionItem[] = Array.from(byInstitution.entries())
    .map(([institution, balance]) => {
      const usage = (balance / FGC_LIMIT) * 100;
      return {
        institution,
        balance,
        sharePercent: currentBalance > 0 ? (balance / currentBalance) * 100 : 0,
        fgcLimit: FGC_LIMIT,
        fgcUsagePercent: usage,
        fgcStatus: usage > 100 ? "acima" : usage >= 80 ? "atencao" : "ok",
      } satisfies PerformanceInstitutionItem;
    })
    .sort((a, b) => b.balance - a.balance);

  const hasFlowsInYear = cashEvents.some((event) => Number(event.year) === year);
  if (!hasFlowsInYear && closedThroughMonth !== null) {
    warnings.push(
      `Não há aportes/resgates lançados em ${year}. Se houve, os saldos reconstruídos ficam acima do real e a rentabilidade abaixo.`,
    );
  }

  if (fiiDividends > 0) {
    warnings.push(
      `FIIs encerrados: ${formatCurrencyBRL(fiiDividends)} em dividendos no ano não entram na rentabilidade (sem saldo registrado).`,
    );
  }

  const payload: PerformancePayload = {
    year,
    kpis: {
      currentBalance,
      openingBalance,
      netContributions,
      unrecordedApplications: Math.max(0, unrecordedApplications),
      grossIncome,
      netIncomeAfterTax: grossIncome * (1 - taxFactor),
      estimatedTaxRatePercent: ESTIMATED_TAX_RATE_PERCENT,
      estimatedTaxOnRedemption,
      balanceAfterTax: currentBalance - estimatedTaxOnRedemption,
      returnPercent,
      cdiPercent,
      percentOfCdi:
        returnPercent !== null && cdiPercent !== null && cdiPercent > 0 ? (returnPercent / cdiPercent) * 100 : null,
      ipcaPercent,
      realReturnPercent,
      closedThroughMonth,
      fiiDividends,
    },
    monthlySeries,
    investments: investmentItems,
    institutions,
    inflationSource,
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

