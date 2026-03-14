import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import {
  ConcentrationItem,
  InvestmentCashEvent,
  MonthlyMacro,
  MonthlyPosition,
  MonthlyReturn,
  PerformanceMonthPoint,
  PerformancePayload,
} from "../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BCB_IPCA_MONTHLY_SERIES_CODE = 433;

type InvestmentRow = {
  id: string;
  type: string;
  institution: string;
  name: string;
  amount_invested: number;
};

type BcbSeriesPoint = {
  data?: string;
  valor?: string;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: { message?: string; code?: string } | null, table: string): boolean {
  if (!error) return false;
  return error.code === "42P01" || Boolean(error.message?.includes(table));
}

function buildBcbSeriesDateRangeUrl(seriesCode: number, year: number): string {
  const params = new URLSearchParams({
    formato: "json",
    dataInicial: `01/01/${year}`,
    dataFinal: `31/12/${year}`,
  });
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados?${params.toString()}`;
}

function parseBcbValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMonthFromBcbDate(raw: string | undefined): number | null {
  if (!raw) return null;
  const [day, month, year] = raw.split("/");
  if (!day || !month || !year) return null;
  const monthNum = Number(month);
  return monthNum >= 1 && monthNum <= 12 ? monthNum : null;
}

async function fetchBcbMonthlyInflation(
  year: number,
): Promise<{ rates: Map<number, number>; warning: string | null }> {
  try {
    const endpoint = buildBcbSeriesDateRangeUrl(BCB_IPCA_MONTHLY_SERIES_CODE, year);
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        rates: new Map(),
        warning: `BCB IPCA (SGS ${BCB_IPCA_MONTHLY_SERIES_CODE}) indisponível (${response.status}).`,
      };
    }

    const payload = (await response.json()) as BcbSeriesPoint[];
    if (!Array.isArray(payload) || payload.length === 0) {
      return {
        rates: new Map(),
        warning: `BCB IPCA (SGS ${BCB_IPCA_MONTHLY_SERIES_CODE}) sem dados para ${year}.`,
      };
    }

    const rates = new Map<number, number>();
    for (const point of payload) {
      const month = parseMonthFromBcbDate(point.data);
      const rate = parseBcbValue(point.valor);
      if (!month || rate === null) continue;
      rates.set(month, rate);
    }

    if (rates.size === 0) {
      return {
        rates,
        warning: `BCB IPCA (SGS ${BCB_IPCA_MONTHLY_SERIES_CODE}) retornou payload inválido para ${year}.`,
      };
    }

    return { rates, warning: null };
  } catch {
    return {
      rates: new Map(),
      warning: `Falha ao consultar BCB IPCA (SGS ${BCB_IPCA_MONTHLY_SERIES_CODE}) para ${year}.`,
    };
  }
}

function eventDateToTimestamp(raw: string | undefined): number {
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  const warnings: string[] = [];

  const [{ data: investments, error: invError }, { data: returns, error: retError }] =
    await Promise.all([
      supabase.from("investments").select("*"),
      supabase
        .from("monthly_returns")
        .select("*")
        .eq("year", year)
        .order("month"),
    ]);

  if (invError || retError || !investments || !returns) {
    return NextResponse.json(
      { error: (invError ?? retError)?.message ?? "Erro ao carregar performance." },
      { status: 500 },
    );
  }

  const [positionsRes, macroRes, cashEventsRes, bcbInflationRes] = await Promise.all([
    supabase.from("monthly_positions").select("*").eq("year", year).order("month"),
    supabase.from("monthly_macro").select("*").eq("year", year).order("month"),
    supabase
      .from("investment_cash_events")
      .select("*")
      .lte("year", year)
      .order("event_date", { ascending: true }),
    fetchBcbMonthlyInflation(year),
  ]);

  if (isMissingTableError(positionsRes.error, "monthly_positions")) {
    warnings.push(
      "Tabela monthly_positions não encontrada. Valor de mercado será estimado por fluxo de renda.",
    );
  } else if (positionsRes.error) {
    return NextResponse.json({ error: positionsRes.error.message }, { status: 500 });
  }

  if (isMissingTableError(macroRes.error, "monthly_macro")) {
    warnings.push("Tabela monthly_macro não encontrada. Usando apenas inflação automática do BCB.");
  } else if (macroRes.error) {
    return NextResponse.json({ error: macroRes.error.message }, { status: 500 });
  }

  if (isMissingTableError(cashEventsRes.error, "investment_cash_events")) {
    warnings.push("Tabela investment_cash_events não encontrada. Eventos de caixa desabilitados.");
  } else if (cashEventsRes.error) {
    return NextResponse.json({ error: cashEventsRes.error.message }, { status: 500 });
  }

  if (bcbInflationRes.warning) {
    warnings.push(`${bcbInflationRes.warning} Aplicando fallback manual (monthly_macro) quando disponível.`);
  }

  const monthlyReturns = (returns ?? []) as MonthlyReturn[];
  const monthlyPositions = ((positionsRes.data ?? []) as MonthlyPosition[]) ?? [];
  const monthlyMacro = ((macroRes.data ?? []) as MonthlyMacro[]) ?? [];
  const allCashEvents = ((cashEventsRes.data ?? []) as InvestmentCashEvent[]) ?? [];
  const invRows = investments as InvestmentRow[];

  const investedCapital = invRows.reduce((acc, inv) => acc + toNumber(inv.amount_invested), 0);

  const incomeByMonth = new Map<number, number>();
  for (const ret of monthlyReturns) {
    incomeByMonth.set(ret.month, (incomeByMonth.get(ret.month) ?? 0) + toNumber(ret.income_value));
  }

  const posByMonth = new Map<number, { marketValue: number }>();
  for (const pos of monthlyPositions) {
    const current = posByMonth.get(pos.month) ?? { marketValue: 0 };
    current.marketValue += toNumber(pos.market_value);
    posByMonth.set(pos.month, current);
  }

  const manualInflationByMonth = new Map<number, number>();
  for (const m of monthlyMacro) {
    manualInflationByMonth.set(m.month, toNumber(m.inflation_rate));
  }

  const inflationByMonth = new Map<number, number>(bcbInflationRes.rates);
  let manualOverrides = 0;
  for (const [month, value] of manualInflationByMonth.entries()) {
    if (inflationByMonth.has(month)) manualOverrides += 1;
    inflationByMonth.set(month, value);
  }

  if (manualOverrides > 0) {
    warnings.push(
      `${manualOverrides} mês(es) com inflação manual sobrescreveram o IPCA automático do BCB.`,
    );
  }

  const inflationSource: PerformancePayload["inflationSource"] =
    bcbInflationRes.rates.size > 0 ? "bcb" : manualInflationByMonth.size > 0 ? "manual" : "none";

  const cashEventsForYear = allCashEvents
    .filter((event) => Number(event.year) === year)
    .sort((a, b) => eventDateToTimestamp(b.event_date) - eventDateToTimestamp(a.event_date));

  const openingNetFlow = allCashEvents
    .filter((event) => Number(event.year) < year)
    .reduce((acc, event) => {
      if (event.type === "APORTE") return acc + toNumber(event.amount);
      if (event.type === "RESGATE") return acc - toNumber(event.amount);
      return acc;
    }, 0);

  const netFlowByMonth = new Map<number, number>();
  const taxesByMonth = new Map<number, number>();
  const feesByMonth = new Map<number, number>();

  for (const event of cashEventsForYear) {
    const month = Number(event.month);
    if (month < 1 || month > 12) continue;

    if (event.type === "APORTE") {
      netFlowByMonth.set(month, (netFlowByMonth.get(month) ?? 0) + toNumber(event.amount));
    } else if (event.type === "RESGATE") {
      netFlowByMonth.set(month, (netFlowByMonth.get(month) ?? 0) - toNumber(event.amount));
    } else if (event.type === "IMPOSTO") {
      taxesByMonth.set(month, (taxesByMonth.get(month) ?? 0) + toNumber(event.amount));
    } else if (event.type === "TAXA") {
      feesByMonth.set(month, (feesByMonth.get(month) ?? 0) + toNumber(event.amount));
    }
  }

  const monthlySeries: PerformanceMonthPoint[] = [];
  let cumulativeNetIncome = 0;
  let cumulativeInflationFactor = 1;
  let cumulativeNetFlow = 0;
  let ytdTaxes = 0;
  let ytdFees = 0;
  let ytdNetIncome = 0;

  for (let month = 1; month <= 12; month++) {
    const passiveIncome = incomeByMonth.get(month) ?? 0;
    const taxes = taxesByMonth.get(month) ?? 0;
    const fees = feesByMonth.get(month) ?? 0;
    const netIncome = passiveIncome - taxes - fees;
    const inflationRate = inflationByMonth.get(month) ?? 0;

    cumulativeNetIncome += netIncome;
    cumulativeNetFlow += netFlowByMonth.get(month) ?? 0;
    ytdTaxes += taxes;
    ytdFees += fees;
    ytdNetIncome += netIncome;

    const costBasis = Math.max(0, investedCapital + openingNetFlow + cumulativeNetFlow);

    const pos = posByMonth.get(month);
    const hasPosition = Boolean(pos && pos.marketValue > 0);
    const marketValue = hasPosition
      ? pos?.marketValue ?? 0
      : Math.max(0, costBasis + cumulativeNetIncome);

    const nominalReturnValue = hasPosition ? marketValue - costBasis : cumulativeNetIncome;
    const nominalReturnPercent =
      costBasis > 0 ? (nominalReturnValue / costBasis) * 100 : 0;

    cumulativeInflationFactor *= 1 + inflationRate / 100;
    const nominalFactor = 1 + nominalReturnPercent / 100;
    const realReturnPercent =
      cumulativeInflationFactor > 0
        ? (nominalFactor / cumulativeInflationFactor - 1) * 100
        : nominalReturnPercent;

    monthlySeries.push({
      month,
      year,
      passiveIncome,
      taxes,
      fees,
      netIncome,
      marketValue,
      costBasis,
      inflationRate,
      nominalReturnPercent,
      realReturnPercent,
    });
  }

  const filledMonths = new Set<number>([
    ...Array.from(incomeByMonth.keys()),
    ...Array.from(posByMonth.keys()),
    ...Array.from(netFlowByMonth.keys()),
    ...Array.from(taxesByMonth.keys()),
    ...Array.from(feesByMonth.keys()),
  ]);

  const lastFilledMonth = Array.from(filledMonths).reduce((acc, m) => Math.max(acc, m), 0);
  const currentMonth = new Date().getMonth() + 1;
  const refMonth = lastFilledMonth > 0 ? lastFilledMonth : currentMonth;
  const monthRef = monthlySeries[Math.max(0, Math.min(refMonth - 1, 11))];

  const latestPositionMonth = Array.from(posByMonth.keys()).reduce((acc, m) => Math.max(acc, m), 0);

  let concentration: ConcentrationItem[] = [];
  if (latestPositionMonth > 0) {
    const byInvestment = new Map<string, number>();
    for (const pos of monthlyPositions) {
      if (Number(pos.month) !== latestPositionMonth) continue;
      byInvestment.set(pos.investment_id, (byInvestment.get(pos.investment_id) ?? 0) + toNumber(pos.market_value));
    }
    const totalValue = Array.from(byInvestment.values()).reduce((a, b) => a + b, 0);
    concentration = invRows
      .filter((inv) => byInvestment.has(inv.id))
      .map((inv) => {
        const value = byInvestment.get(inv.id) ?? 0;
        return {
          investmentId: inv.id,
          label: `${inv.name} (${inv.institution})`,
          value,
          sharePercent: totalValue > 0 ? (value / totalValue) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  } else {
    const refDate = new Date(year, refMonth, 0).getTime();
    const byInvestment = new Map<string, number>();
    for (const inv of invRows) {
      byInvestment.set(inv.id, toNumber(inv.amount_invested));
    }
    for (const event of allCashEvents) {
      const timestamp = eventDateToTimestamp(event.event_date);
      if (!timestamp || timestamp > refDate) continue;
      if (!byInvestment.has(event.investment_id)) continue;
      if (event.type === "APORTE") {
        byInvestment.set(event.investment_id, (byInvestment.get(event.investment_id) ?? 0) + toNumber(event.amount));
      } else if (event.type === "RESGATE") {
        byInvestment.set(event.investment_id, Math.max(0, (byInvestment.get(event.investment_id) ?? 0) - toNumber(event.amount)));
      }
    }

    const totalValue = Array.from(byInvestment.values()).reduce((a, b) => a + b, 0);
    concentration = invRows
      .map((inv) => {
        const value = byInvestment.get(inv.id) ?? 0;
        return {
          investmentId: inv.id,
          label: `${inv.name} (${inv.institution})`,
          value,
          sharePercent: totalValue > 0 ? (value / totalValue) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    warnings.push("Concentração calculada por capital (sem posição mensal de mercado).");
  }

  const payload: PerformancePayload = {
    kpis: {
      investedCapital,
      currentCostBasis: monthRef.costBasis,
      currentMarketValue: monthRef.marketValue,
      ytdPassiveIncomeNet: ytdNetIncome,
      ytdTaxes,
      ytdFees,
      nominalReturnPercent: monthRef.nominalReturnPercent,
      realReturnPercent: monthRef.realReturnPercent,
    },
    monthlySeries,
    concentration,
    cashEvents: cashEventsForYear,
    inflationSource,
    warnings: warnings.map((warning) => warning.trim()).filter(Boolean),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
