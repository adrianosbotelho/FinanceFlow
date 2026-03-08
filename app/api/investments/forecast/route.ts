import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

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

function countBusinessDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

function countBusinessDaysElapsedInMonth(year: number, month: number, dayLimit: number): number {
  let count = 0;
  for (let day = 1; day <= dayLimit; day++) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

function monthForecast(amountInvested: number, annualRatePct: number, businessDays: number): number {
  if (amountInvested <= 0 || businessDays <= 0) return 0;
  const annual = annualRatePct / 100;
  const daily = Math.pow(1 + annual, 1 / 252) - 1;
  return amountInvested * (Math.pow(1 + daily, businessDays) - 1);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const cdiFromQuery = Number(searchParams.get("cdi_annual_rate"));
  const defaultCdi = Number(process.env.FINANCEFLOW_CDI_ANNUAL_RATE ?? 10.65);
  const cdiAnnualRatePct =
    Number.isFinite(cdiFromQuery) && cdiFromQuery > 0 ? cdiFromQuery : defaultCdi;

  const [{ data: investments, error: invError }, { data: returns, error: retError }] =
    await Promise.all([
      supabase.from("investments").select("id,type,name,amount_invested,institution"),
      supabase.from("monthly_returns").select("investment_id,month,year,income_value").eq("year", year),
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
  for (const row of returns) {
    if (!cdbIds.has(row.investment_id)) continue;
    const prev = realizedByMonth.get(row.month) ?? 0;
    realizedByMonth.set(row.month, prev + Number(row.income_value ?? 0));
  }

  const series: MonthPoint[] = Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const businessDays = countBusinessDaysInMonth(year, month);
    return {
      month,
      realized: realizedByMonth.get(month) ?? 0,
      forecast: monthForecast(cdbInvested, cdiAnnualRatePct, businessDays),
    };
  });
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const cdbBreakdown = cdbInvestments.map((inv) => {
    const amount = Number(inv.amount_invested ?? 0);
    const realizedMap = new Map<number, number>();
    for (const row of returns) {
      if (row.investment_id !== inv.id) continue;
      const prev = realizedMap.get(row.month) ?? 0;
      realizedMap.set(row.month, prev + Number(row.income_value ?? 0));
    }
    const investmentSeries: MonthPoint[] = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const businessDays = countBusinessDaysInMonth(year, month);
      return {
        month,
        realized: realizedMap.get(month) ?? 0,
        forecast: monthForecast(amount, cdiAnnualRatePct, businessDays),
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
      current: {
        forecast: current.forecast,
        realized: current.realized,
        gap,
        completionPercent,
      },
      series: investmentSeries,
    };
  });

  const currentPoint = series[currentMonth - 1] ?? { month: currentMonth, realized: 0, forecast: 0 };
  const elapsedBusinessDays = countBusinessDaysElapsedInMonth(year, currentMonth, currentDay);
  const totalBusinessDays = countBusinessDaysInMonth(year, currentMonth);
  const expectedToDate = monthForecast(cdbInvested, cdiAnnualRatePct, elapsedBusinessDays);
  const monthGap = currentPoint.forecast - currentPoint.realized;
  const completionPercent =
    currentPoint.forecast > 0 ? (currentPoint.realized / currentPoint.forecast) * 100 : 0;
  const pacePercent = expectedToDate > 0 ? (currentPoint.realized / expectedToDate) * 100 : 0;

  const daysInMonth = new Date(year, currentMonth, 0).getDate();
  const daySeries: DayPoint[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const bDays = countBusinessDaysElapsedInMonth(year, currentMonth, day);
    const forecastAccumulated = monthForecast(cdbInvested, cdiAnnualRatePct, bDays);
    let realizedAccumulated: number | null = null;
    if (day <= currentDay && elapsedBusinessDays > 0) {
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
