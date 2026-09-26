import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import {
  countBusinessDaysBetween,
  countBusinessDaysElapsedInMonth,
  countBusinessDaysInMonth,
  previousBusinessDay,
} from "../../../../lib/business-days";
import {
  resolveCdiAnnualReferenceWithSource,
  resolveMonthlyCdiHistory,
} from "../../../../lib/cdi-reference";

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

type CdiPercentSource = "contracted" | "historical" | "default";

type ReturnPoint = { year: number; month: number; value: number };

type CashEvent = { date: Date; signedAmount: number };

type InvestmentContext = {
  principalNow: number;
  startDate: Date | null;
  firstIncomeYm: number | null;
  returns: ReturnPoint[];
  events: CashEvent[];
};

function ymToNumber(year: number, month: number): number {
  return year * 100 + month;
}

function parseIsoDate(value: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseContractedCdiPercent(value: unknown): number | null {
  const parsed = Number(value);
  if (value === null || value === undefined || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const cdiFromQuery = Number(searchParams.get("cdi_annual_rate"));
  // Cenário informado na tela > CDI atual do BCB > FINANCEFLOW_CDI_ANNUAL_RATE > 10,65.
  const [cdiReference, cdiMonthlyHistory] = await Promise.all([
    Number.isFinite(cdiFromQuery) && cdiFromQuery > 0
      ? Promise.resolve({ value: cdiFromQuery, source: "scenario" as const })
      : resolveCdiAnnualReferenceWithSource(),
    resolveMonthlyCdiHistory(year),
  ]);
  const cdiAnnualRatePct = cdiReference.value;

  const [
    { data: investments, error: invError },
    { data: returns, error: retError },
    { data: cashEvents, error: eventsError },
  ] = await Promise.all([
    supabase
      .from("investments")
      .select("id,type,name,amount_invested,institution,cdi_rate,start_date"),
    supabase
      .from("monthly_returns")
      .select("investment_id,month,year,income_value")
      .lte("year", year),
    supabase.from("investment_cash_events").select("investment_id,event_date,type,amount"),
  ]);

  if (invError || retError || !investments || !returns) {
    return NextResponse.json(
      { error: (invError ?? retError)?.message ?? "Erro ao calcular previsão." },
      { status: 500 },
    );
  }
  if (eventsError) {
    console.warn("[FinanceFlow] Eventos de caixa indisponíveis; previsão usa o saldo atual.", eventsError.message);
  }

  const cdbInvestments = investments.filter((i) => i.type === "CDB");
  const cdbIds = new Set(cdbInvestments.map((i) => i.id));
  const cdbInvested = cdbInvestments.reduce(
    (acc, i) => acc + Number(i.amount_invested ?? 0),
    0,
  );

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYm = ymToNumber(now.getFullYear(), currentMonth);

  const realizedByMonth = new Map<number, number>();
  const contexts = new Map<string, InvestmentContext>();
  for (const inv of cdbInvestments) {
    contexts.set(inv.id, {
      principalNow: Number(inv.amount_invested ?? 0),
      startDate: parseIsoDate(inv.start_date),
      firstIncomeYm: null,
      returns: [],
      events: [],
    });
  }
  for (const row of returns) {
    if (!cdbIds.has(row.investment_id)) continue;
    const value = Number(row.income_value ?? 0);
    contexts.get(row.investment_id)?.returns.push({
      year: Number(row.year),
      month: Number(row.month),
      value,
    });
    if (Number(row.year) === year) {
      realizedByMonth.set(row.month, (realizedByMonth.get(row.month) ?? 0) + value);
    }
  }
  for (const row of cashEvents ?? []) {
    const context = contexts.get(row.investment_id);
    const date = parseIsoDate(row.event_date);
    const type = String(row.type ?? "").toUpperCase();
    if (!context || !date || (type !== "APORTE" && type !== "RESGATE")) continue;
    const amount = Number(row.amount ?? 0);
    context.events.push({ date, signedAmount: type === "APORTE" ? amount : -amount });
  }
  for (const context of Array.from(contexts.values())) {
    context.returns.sort((a, b) => a.year - b.year || a.month - b.month);
    const firstIncome = context.returns.find((r) => r.value > 0);
    context.firstIncomeYm = firstIncome ? ymToNumber(firstIncome.year, firstIncome.month) : null;
  }

  // CDI diário do mês: meses fechados usam o CDI realizado (BCB 4391); o atual e os futuros, o de referência.
  function dailyCdiFor(y: number, m: number): number {
    const monthlyPercent = y === year ? cdiMonthlyHistory.get(m) : undefined;
    if (ymToNumber(y, m) < currentYm && monthlyPercent !== undefined) {
      return Math.pow(1 + monthlyPercent / 100, 1 / Math.max(1, countBusinessDaysInMonth(y, m))) - 1;
    }
    return Math.pow(1 + cdiAnnualRatePct / 100, 1 / 252) - 1;
  }

  // Rendimento previsto de um CDB no mês (até uptoDay, se informado). amount_invested é o saldo atual
  // (principal + renda reinvestida), então o saldo de abertura do mês é o saldo atual menos os
  // aportes/resgates e menos a renda lançada a partir do início do mês. Aportes e resgates do mês
  // rendem só a partir da data do evento.
  function forecastFor(
    context: InvestmentContext,
    y: number,
    m: number,
    cdiPercent: number,
    uptoDay?: number,
  ): number {
    const monthStart = new Date(y, m - 1, 1);
    const dayBeforeMonth = new Date(y, m - 1, 0);
    const periodEnd = uptoDay !== undefined ? new Date(y, m - 1, uptoDay) : new Date(y, m, 0);
    const ym = ymToNumber(y, m);

    if (context.startDate && context.startDate > periodEnd) return 0;
    // Sem data de início: meses passados antes da primeira renda são anteriores à aplicação.
    if (!context.startDate && ym < currentYm && (context.firstIncomeYm === null || ym < context.firstIncomeYm)) {
      return 0;
    }

    const netFromMonthStart = context.events
      .filter((event) => event.date >= monthStart)
      .reduce((acc, event) => acc + event.signedAmount, 0);
    const incomeFromMonthStart = context.returns
      .filter((r) => ymToNumber(r.year, r.month) >= ym)
      .reduce((acc, r) => acc + r.value, 0);
    const opening = Math.max(0, context.principalNow - netFromMonthStart - incomeFromMonthStart);

    const daily = dailyCdiFor(y, m) * (cdiPercent / 100);
    const growthFrom = (startExclusive: Date): number =>
      Math.pow(1 + daily, countBusinessDaysBetween(startExclusive, periodEnd)) - 1;

    const accrualStart =
      context.startDate && context.startDate >= monthStart ? context.startDate : dayBeforeMonth;
    let total = opening * growthFrom(accrualStart);
    for (const event of context.events) {
      if (event.date < monthStart || event.date > periodEnd) continue;
      total += event.signedAmount * growthFrom(event.date);
    }
    return Math.max(0, total);
  }

  // Sem % contratado: % do CDI efetivo = realizado / previsto a 100% do CDI nos últimos 3 meses
  // fechados (o mês de estreia fica fora por ser parcial). Limitado a 50%–150%.
  function estimateHistoricalCdiPercent(context: InvestmentContext): number | null {
    const window = context.returns
      .filter(
        (r) =>
          r.value > 0 &&
          ymToNumber(r.year, r.month) < currentYm &&
          (context.firstIncomeYm === null || ymToNumber(r.year, r.month) > context.firstIncomeYm),
      )
      .slice(-3);
    if (window.length === 0) return null;
    const realized = window.reduce((acc, r) => acc + r.value, 0);
    const expected = window.reduce((acc, r) => acc + forecastFor(context, r.year, r.month, 100), 0);
    if (expected <= 0) return null;
    return Math.min(150, Math.max(50, (realized / expected) * 100));
  }

  const cdiPercentById = new Map<string, { percent: number; source: CdiPercentSource }>(
    cdbInvestments.map((inv) => {
      const contracted = parseContractedCdiPercent(inv.cdi_rate);
      if (contracted !== null) return [inv.id, { percent: contracted, source: "contracted" }];
      const context = contexts.get(inv.id);
      const historical = context ? estimateHistoricalCdiPercent(context) : null;
      if (historical !== null) return [inv.id, { percent: historical, source: "historical" }];
      return [inv.id, { percent: 100, source: "default" }];
    }),
  );

  // Lançamentos são o acumulado até o dia útil anterior (D−1): o realizado vale até esse dia.
  const dataDate = previousBusinessDay(now);
  const dataDay =
    dataDate.getFullYear() === year && dataDate.getMonth() + 1 === currentMonth ? dataDate.getDate() : 0;

  const cdbBreakdown = cdbInvestments.map((inv) => {
    const amount = Number(inv.amount_invested ?? 0);
    const context = contexts.get(inv.id)!;
    const cdiRate = cdiPercentById.get(inv.id) ?? { percent: 100, source: "default" as CdiPercentSource };
    const investmentSeries: MonthPoint[] = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const realized = context.returns
        .filter((r) => r.year === year && r.month === month)
        .reduce((sum, r) => sum + r.value, 0);
      return {
        month,
        realized,
        forecast: forecastFor(context, year, month, cdiRate.percent),
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
  const forecastUntilDay = (day: number): number =>
    day <= 0
      ? 0
      : cdbInvestments.reduce((acc, inv) => {
          const context = contexts.get(inv.id);
          if (!context) return acc;
          return acc + forecastFor(context, year, currentMonth, cdiPercentById.get(inv.id)?.percent ?? 100, day);
        }, 0);
  const expectedToDate = forecastUntilDay(dataDay);
  const monthGap = currentPoint.forecast - currentPoint.realized;
  const completionPercent =
    currentPoint.forecast > 0 ? (currentPoint.realized / currentPoint.forecast) * 100 : 0;
  const pacePercent = expectedToDate > 0 ? (currentPoint.realized / expectedToDate) * 100 : 0;

  const daysInMonth = new Date(year, currentMonth, 0).getDate();
  const daySeries: DayPoint[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const bDays = countBusinessDaysElapsedInMonth(year, currentMonth, day);
    const forecastAccumulated = forecastUntilDay(day);
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
