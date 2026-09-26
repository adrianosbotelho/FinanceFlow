import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import {
  countBusinessDaysElapsedInMonth,
  countBusinessDaysInMonth,
  previousBusinessDay,
} from "../../../../lib/business-days";
import { resolveCdiAnnualReferenceWithSource } from "../../../../lib/cdi-reference";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MonthPoint = {
  month: number;
  realized: number;
  forecast: number;
};

type DayPoint = {
  day: number;
  realizedAccumulated: number | null;
  forecastAccumulated: number;
};

// CDB pós-fixado: rende cdiPercent% do CDI diário (base 252), capitalizado por dia útil.
function monthForecast(
  amountInvested: number,
  cdiAnnualRatePct: number,
  businessDays: number,
  cdiPercent = 100,
): number {
  if (amountInvested <= 0 || businessDays <= 0) return 0;
  const cdiDaily = Math.pow(1 + cdiAnnualRatePct / 100, 1 / 252) - 1;
  const daily = cdiDaily * (cdiPercent / 100);
  return amountInvested * (Math.pow(1 + daily, businessDays) - 1);
}

type CdiPercentSource = "contracted" | "historical" | "default";

function parseContractedCdiPercent(value: unknown): number | null {
  const parsed = Number(value);
  if (value === null || value === undefined || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

// Sem % contratado: % do CDI efetivo = realizado / previsto a 100% do CDI nos últimos 3 meses
// fechados (o mês de estreia fica fora por ser parcial). Limitado a 50%–150%.
function estimateHistoricalCdiPercent(
  principal: number,
  returns: Array<{ year: number; month: number; value: number }>,
  cdiAnnualRatePct: number,
  current: { year: number; month: number },
): number | null {
  const firstIncome = returns.find((r) => r.value > 0);
  const closed = returns.filter(
    (r) =>
      r.value > 0 &&
      ymToNumber(r.year, r.month) < ymToNumber(current.year, current.month) &&
      (!firstIncome || ymToNumber(r.year, r.month) > ymToNumber(firstIncome.year, firstIncome.month)),
  );
  const window = closed.slice(-3);
  if (window.length === 0) return null;
  let realized = 0;
  let expected = 0;
  for (const point of window) {
    const carried = returns
      .filter((r) => ymToNumber(r.year, r.month) < ymToNumber(point.year, point.month))
      .reduce((sum, r) => sum + r.value, 0);
    realized += point.value;
    expected += monthForecast(principal + carried, cdiAnnualRatePct, countBusinessDaysInMonth(point.year, point.month));
  }
  if (expected <= 0) return null;
  return Math.min(150, Math.max(50, (realized / expected) * 100));
}

function ymToNumber(year: number, month: number): number {
  return year * 100 + month;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const cdiFromQuery = Number(searchParams.get("cdi_annual_rate"));
  // Cenário informado na tela > CDI atual do BCB > FINANCEFLOW_CDI_ANNUAL_RATE > 10,65.
  const cdiReference =
    Number.isFinite(cdiFromQuery) && cdiFromQuery > 0
      ? { value: cdiFromQuery, source: "scenario" as const }
      : await resolveCdiAnnualReferenceWithSource();
  const cdiAnnualRatePct = cdiReference.value;

  const [{ data: investments, error: invError }, { data: returns, error: retError }] =
    await Promise.all([
      supabase.from("investments").select("id,type,name,amount_invested,institution,cdi_rate"),
      supabase
        .from("monthly_returns")
        .select("investment_id,month,year,income_value")
        .lte("year", year),
    ]);

  if (invError || retError || !investments || !returns) {
    return NextResponse.json(
      { error: (invError ?? retError)?.message ?? "Erro ao calcular previsão." },
      { status: 500 },
    );
  }

  const cdbInvestments = investments.filter((i) => i.type === "CDB");
  const cdbIds = new Set(cdbInvestments.map((i) => i.id));
  const cdbInvested = cdbInvestments.reduce(
    (acc, i) => acc + Number(i.amount_invested ?? 0),
    0,
  );

  const realizedByMonth = new Map<number, number>();
  const realizedByInvestment = new Map<string, Array<{ year: number; month: number; value: number }>>();
  for (const row of returns) {
    if (!cdbIds.has(row.investment_id)) continue;
    const value = Number(row.income_value ?? 0);
    const arr = realizedByInvestment.get(row.investment_id) ?? [];
    arr.push({
      year: Number(row.year),
      month: Number(row.month),
      value,
    });
    realizedByInvestment.set(row.investment_id, arr);
    if (Number(row.year) === year) {
      const prev = realizedByMonth.get(row.month) ?? 0;
      realizedByMonth.set(row.month, prev + value);
    }
  }
  for (const [invId, arr] of realizedByInvestment.entries()) {
    arr.sort((a, b) => a.year - b.year || a.month - b.month);
    realizedByInvestment.set(invId, arr);
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const cdiPercentById = new Map<string, { percent: number; source: CdiPercentSource }>(
    cdbInvestments.map((inv) => {
      const contracted = parseContractedCdiPercent(inv.cdi_rate);
      if (contracted !== null) return [inv.id, { percent: contracted, source: "contracted" }];
      const historical = estimateHistoricalCdiPercent(
        Number(inv.amount_invested ?? 0),
        realizedByInvestment.get(inv.id) ?? [],
        cdiAnnualRatePct,
        { year: now.getFullYear(), month: currentMonth },
      );
      if (historical !== null) return [inv.id, { percent: historical, source: "historical" }];
      return [inv.id, { percent: 100, source: "default" }];
    }),
  );
  const currentDay = now.getDate();
  // Lançamentos são o acumulado até o dia útil anterior (D−1): o realizado vale até esse dia.
  const dataDate = previousBusinessDay(now);
  const dataDay =
    dataDate.getFullYear() === year && dataDate.getMonth() + 1 === currentMonth ? dataDate.getDate() : 0;
  const cdbBreakdown = cdbInvestments.map((inv) => {
    const amount = Number(inv.amount_invested ?? 0);
    const invReturns = realizedByInvestment.get(inv.id) ?? [];
    const cdiRate = cdiPercentById.get(inv.id) ?? { percent: 100, source: "default" as CdiPercentSource };
    const investmentSeries: MonthPoint[] = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const businessDays = countBusinessDaysInMonth(year, month);
      const carried = invReturns
        .filter((r) => ymToNumber(r.year, r.month) < ymToNumber(year, month))
        .reduce((sum, r) => sum + r.value, 0);
      const realized = invReturns
        .filter((r) => r.year === year && r.month === month)
        .reduce((sum, r) => sum + r.value, 0);
      return {
        month,
        realized,
        forecast: monthForecast(amount + carried, cdiAnnualRatePct, businessDays, cdiRate.percent),
      };
    });
    const current = investmentSeries[currentMonth - 1] ?? {
      month: currentMonth,
      realized: 0,
      forecast: 0,
    };
    const gap = current.forecast - current.realized;
    const completionPercent =
      current.forecast > 0 ? (current.realized / current.forecast) * 100 : 0;
    return {
      investmentId: inv.id,
      label: inv.name,
      institution: inv.institution,
      amountInvested: amount,
      cdiPercent: cdiRate.percent,
      cdiPercentSource: cdiRate.source,
      current: {
        forecast: current.forecast,
        realized: current.realized,
        gap,
        completionPercent,
      },
      series: investmentSeries,
    };
  });

  // Previsão total = soma das previsões de cada CDB, cada um com o seu % do CDI.
  const series: MonthPoint[] = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    realized: realizedByMonth.get(idx + 1) ?? 0,
    forecast: cdbBreakdown.reduce((acc, item) => acc + (item.series[idx]?.forecast ?? 0), 0),
  }));

  const currentPoint = series[currentMonth - 1] ?? { month: currentMonth, realized: 0, forecast: 0 };
  const elapsedBusinessDays = countBusinessDaysElapsedInMonth(year, currentMonth, dataDay);
  const totalBusinessDays = countBusinessDaysInMonth(year, currentMonth);
  const openingCurrentMonth = cdbInvestments.map((inv) => {
    const invReturns = realizedByInvestment.get(inv.id) ?? [];
    const carried = invReturns
      .filter((r) => ymToNumber(r.year, r.month) < ymToNumber(year, currentMonth))
      .reduce((sum, r) => sum + r.value, 0);
    return {
      principal: Number(inv.amount_invested ?? 0) + carried,
      cdiPercent: cdiPercentById.get(inv.id)?.percent ?? 100,
    };
  });
  const forecastUntil = (businessDays: number): number =>
    openingCurrentMonth.reduce(
      (acc, item) => acc + monthForecast(item.principal, cdiAnnualRatePct, businessDays, item.cdiPercent),
      0,
    );
  const expectedToDate = forecastUntil(elapsedBusinessDays);
  const monthGap = currentPoint.forecast - currentPoint.realized;
  const completionPercent =
    currentPoint.forecast > 0 ? (currentPoint.realized / currentPoint.forecast) * 100 : 0;
  const pacePercent = expectedToDate > 0 ? (currentPoint.realized / expectedToDate) * 100 : 0;

  const daysInMonth = new Date(year, currentMonth, 0).getDate();
  const daySeries: DayPoint[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const bDays = countBusinessDaysElapsedInMonth(year, currentMonth, day);
    const forecastAccumulated = forecastUntil(bDays);
    let realizedAccumulated: number | null = null;
    if (day <= dataDay && elapsedBusinessDays > 0) {
      realizedAccumulated = currentPoint.realized * (bDays / elapsedBusinessDays);
    }
    daySeries.push({
      day,
      realizedAccumulated,
      forecastAccumulated,
    });
  }

  return NextResponse.json(
    {
      cdbInvested,
      cdiAnnualRatePct,
      cdiSource: cdiReference.source,
      year,
      currentMonth,
      kpis: {
        monthForecast: currentPoint.forecast,
        monthRealized: currentPoint.realized,
        monthGap,
        completionPercent,
        expectedToDate,
        pacePercent,
        elapsedBusinessDays,
        totalBusinessDays,
      },
      series,
      daySeries,
      cdbBreakdown,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
