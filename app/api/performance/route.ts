import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import {
  ConcentrationItem,
  MonthlyMacro,
  MonthlyPosition,
  MonthlyReturn,
  PerformanceMonthPoint,
  PerformancePayload,
} from "../../../types";

type InvestmentRow = {
  id: string;
  type: string;
  institution: string;
  name: string;
  amount_invested: number;
};

function byMonthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

  const { data: rawPositions, error: positionsError } = await supabase
    .from("monthly_positions")
    .select("*")
    .eq("year", year)
    .order("month");

  const { data: rawMacro, error: macroError } = await supabase
    .from("monthly_macro")
    .select("*")
    .eq("year", year)
    .order("month");

  if (positionsError?.message?.includes("monthly_positions")) {
    warnings.push(
      "Tabela monthly_positions não encontrada. Usando capital investido como aproximação de valor de mercado.",
    );
  } else if (positionsError) {
    return NextResponse.json({ error: positionsError.message }, { status: 500 });
  }

  if (macroError?.message?.includes("monthly_macro")) {
    warnings.push(
      "Tabela monthly_macro não encontrada. Retorno real está usando inflação 0%.",
    );
  } else if (macroError) {
    return NextResponse.json({ error: macroError.message }, { status: 500 });
  }

  const monthlyReturns = (returns ?? []) as MonthlyReturn[];
  const monthlyPositions = ((rawPositions ?? []) as MonthlyPosition[]) ?? [];
  const monthlyMacro = ((rawMacro ?? []) as MonthlyMacro[]) ?? [];
  const invRows = investments as InvestmentRow[];

  const investedCapital = invRows.reduce(
    (acc, inv) => acc + toNumber(inv.amount_invested),
    0,
  );

  const incomeByMonth = new Map<number, number>();
  for (const ret of monthlyReturns) {
    const current = incomeByMonth.get(ret.month) ?? 0;
    incomeByMonth.set(ret.month, current + toNumber(ret.income_value));
  }

  const posByMonth = new Map<number, { marketValue: number; taxes: number; fees: number }>();
  for (const pos of monthlyPositions) {
    const current = posByMonth.get(pos.month) ?? {
      marketValue: 0,
      taxes: 0,
      fees: 0,
    };
    current.marketValue += toNumber(pos.market_value);
    current.taxes += toNumber(pos.taxes_paid);
    current.fees += toNumber(pos.fees_paid);
    posByMonth.set(pos.month, current);
  }

  const inflationByMonth = new Map<number, number>();
  for (const m of monthlyMacro) {
    inflationByMonth.set(m.month, toNumber(m.inflation_rate));
  }

  const monthlySeries: PerformanceMonthPoint[] = [];
  let cumulativeNetIncome = 0;
  let cumulativeInflationFactor = 1;
  let ytdTaxes = 0;
  let ytdFees = 0;
  let ytdNetIncome = 0;

  for (let month = 1; month <= 12; month++) {
    const passiveIncome = incomeByMonth.get(month) ?? 0;
    const pos = posByMonth.get(month);
    const marketValue = pos?.marketValue ?? investedCapital;
    const taxes = pos?.taxes ?? 0;
    const fees = pos?.fees ?? 0;
    const netIncome = passiveIncome - taxes - fees;
    const inflationRate = inflationByMonth.get(month) ?? 0;

    cumulativeNetIncome += netIncome;
    ytdTaxes += taxes;
    ytdFees += fees;
    ytdNetIncome += netIncome;

    const nominalReturnPercent =
      investedCapital > 0
        ? ((marketValue - investedCapital + cumulativeNetIncome) / investedCapital) *
          100
        : 0;
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
      inflationRate,
      nominalReturnPercent,
      realReturnPercent,
    });
  }

  const lastFilledMonth = [...incomeByMonth.keys(), ...posByMonth.keys()].reduce(
    (acc, m) => Math.max(acc, m),
    0,
  );
  const monthRef =
    monthlySeries[(lastFilledMonth > 0 ? lastFilledMonth : new Date().getMonth() + 1) - 1] ??
    monthlySeries[monthlySeries.length - 1];

  const latestPositionMonth = [...posByMonth.keys()].reduce(
    (acc, m) => Math.max(acc, m),
    0,
  );

  let concentration: ConcentrationItem[] = [];
  if (latestPositionMonth > 0) {
    const byInvestment = new Map<string, number>();
    for (const p of monthlyPositions) {
      if (p.month !== latestPositionMonth) continue;
      byInvestment.set(
        p.investment_id,
        (byInvestment.get(p.investment_id) ?? 0) + toNumber(p.market_value),
      );
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
  }

  const payload: PerformancePayload = {
    kpis: {
      investedCapital,
      currentMarketValue: monthRef.marketValue,
      ytdPassiveIncomeNet: ytdNetIncome,
      ytdTaxes,
      ytdFees,
      nominalReturnPercent: monthRef.nominalReturnPercent,
      realReturnPercent: monthRef.realReturnPercent,
    },
    monthlySeries,
    concentration,
    warnings,
  };

  return NextResponse.json(payload);
}
