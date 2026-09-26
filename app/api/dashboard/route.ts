import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import {
  ConsistencyAlert,
  DashboardPayload,
  FinancialInsights,
  GoalProgress,
  IncomeDistribution,
  MonthComparisonPoint,
  PassiveIncomeByMonth,
} from "../../../types";
import { buildKpis } from "../../../lib/calculations";
import { monthLabel } from "../../../lib/formatters";
import { countBusinessDaysInMonth } from "../../../lib/business-days";
import {
  PaceInvestmentRow,
  PaceReturnRow,
  PaceRevisionRow,
  buildMonthPace,
  parseIsoDate,
} from "../../../lib/month-pace";
import { MonthPace } from "../../../types";
import { resolveCdiAnnualReference } from "../../../lib/cdi-reference";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const IPCA_12M_SERIES_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/12?formato=json";
const SELIC_TREND_LOOKBACK_DAYS = 120;
const FII_TREND_CACHE_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const FII_TREND_CACHE_FALLBACK_TTL_MS = 30 * 60 * 1000;

let fiiTrendCache:
  | {
      value: {
        selicMetaPercent: number;
        ipca12mPercent: number;
        selicTrend3mPercent: number | null;
        ipcaTrend3mPercent: number | null;
      };
      expiresAt: number;
    }
  | null = null;

type BcbSeriesPoint = {
  data?: string;
  valor?: string;
};

function isItauInstitution(institution: string): boolean {
  const normalized = institution
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.includes("itau");
}

function buildInvestmentLabel(inv: { type: string; institution: string; name: string }): string {
  if (inv.type === "FII") return "Dividendos FIIs";
  return inv.name || `CDB ${inv.institution}`;
}

function getSaoPauloDateISO(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

function clampMonth(input: number | null, fallback: number): number {
  const value = Number(input);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(12, Math.max(1, value));
}

function clampYear(input: number | null, fallback: number): number {
  const value = Number(input);
  if (!Number.isInteger(value)) return fallback;
  if (value < 2000 || value > fallback) return fallback;
  return value;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = clampYear(
    searchParams.get("year") ? Number(searchParams.get("year")) : null,
    now.getFullYear(),
  );
  const analysisMonth = clampMonth(
    searchParams.get("month") ? Number(searchParams.get("month")) : null,
    now.getMonth() + 1,
  );
  const cdiAnnualPromise = resolveCdiAnnualReference();
  const fiiTrendSignalsPromise = resolveFiiMarketTrendSignals();

  const [
    { data: investments, error: invError },
    { data: returns, error: retError },
    { data: positions, error: posError },
    { data: revisions, error: revError },
    { data: monthlyGoals, error: goalsError },
  ] = await Promise.all([
    supabase.from("investments").select("*"),
    supabase
      .from("monthly_returns")
      .select("*")
      .gte("year", year - 1)
      .lte("year", year)
      .order("year")
      .order("month"),
    supabase.from("monthly_positions").select("*").eq("year", year).order("month"),
    supabase
      .from("monthly_return_revisions")
      .select("investment_id,new_income_value,created_at")
      .eq("year", year)
      .eq("month", analysisMonth),
    supabase.from("investment_goals_monthly").select("month,monthly_target").eq("year", year),
  ]);
  if (revError) console.warn("[FinanceFlow] Revisões indisponíveis para o ritmo do mês:", revError.message);
  if (goalsError) console.warn("[FinanceFlow] Metas mensais indisponíveis:", goalsError.message);

  if (invError || retError || !investments || !returns) {
    console.error(invError ?? retError);
    return NextResponse.json(
      { error: (invError ?? retError)?.message ?? "Erro ao buscar dados" },
      { status: 500 },
    );
  }
  if (posError && !posError.message?.includes("monthly_positions")) {
    return NextResponse.json({ error: posError.message }, { status: 500 });
  }

  const [cdiAnnualReference, fiiTrendSignals] = await Promise.all([
    cdiAnnualPromise,
    fiiTrendSignalsPromise,
  ]);

  const byInvestment = new Map<string, (typeof investments)[number]>();
  for (const inv of investments) {
    byInvestment.set(inv.id, inv);
  }

  const cdbInvestments = investments.filter((inv) => inv.type === "CDB");
  const cdbInvestmentIds = cdbInvestments.map((inv) => inv.id);

  const seriesMap = new Map<string, PassiveIncomeByMonth>();

  function getKey(y: number, m: number) {
    return `${y}-${m}`;
  }

  for (const row of returns) {
    const inv = byInvestment.get(row.investment_id);
    if (!inv) continue;

    const key = getKey(row.year, row.month);
    let bucket = seriesMap.get(key);
    if (!bucket) {
      bucket = {
        month: row.month,
        year: row.year,
        cdb_items: cdbInvestments.map((cdb) => ({
          investment_id: cdb.id,
          label: buildInvestmentLabel(cdb),
          income: 0,
        })),
        fii_dividends: 0,
        total: 0,
      };
      seriesMap.set(key, bucket);
    }

    if (inv.type === "CDB") {
      const cdbEntry = bucket.cdb_items.find((c) => c.investment_id === inv.id);
      if (cdbEntry) {
        cdbEntry.income += Number(row.income_value);
      }
    } else if (inv.type === "FII") {
      bucket.fii_dividends += Number(row.income_value);
    }

    const cdbTotal = bucket.cdb_items.reduce((acc, c) => acc + c.income, 0);
    bucket.total = cdbTotal + bucket.fii_dividends;
  }

  const monthlySeries = Array.from(seriesMap.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );

  const referenceSeries = monthlySeries.filter(
    (m) => m.year < year || (m.year === year && m.month <= analysisMonth),
  );

  const byYearMonth = new Map<string, PassiveIncomeByMonth>();
  for (const m of referenceSeries) {
    byYearMonth.set(`${m.year}-${m.month}`, m);
  }

  const yearPrev = year - 1;
  const comparisonByMonth: MonthComparisonPoint[] = Array.from(
    { length: analysisMonth },
    (_, i) => {
      const month = i + 1;
      const prev = byYearMonth.get(`${yearPrev}-${month}`);
      const curr = byYearMonth.get(`${year}-${month}`);
      return {
        month,
        monthName: monthLabel(month),
        yearPrev,
        yearCurr: year,
        cdbItems: cdbInvestments.map((cdb) => {
          const prevEntry = prev?.cdb_items.find((c) => c.investment_id === cdb.id);
          const currEntry = curr?.cdb_items.find((c) => c.investment_id === cdb.id);
          return {
            investment_id: cdb.id,
            label: buildInvestmentLabel(cdb),
            prev: prevEntry?.income ?? 0,
            curr: currEntry?.income ?? 0,
          };
        }),
        fiiPrev: prev?.fii_dividends ?? 0,
        fiiCurr: curr?.fii_dividends ?? 0,
        totalPrev: prev?.total ?? 0,
        totalCurr: curr?.total ?? 0,
      };
    },
  );

  const yoySeries = referenceSeries.filter((m) => m.year === year);

  const totalInvested = investments.reduce(
    (acc, inv) => acc + Number(inv.amount_invested),
    0,
  );

  const monthPace = buildMonthPace({
    year,
    month: analysisMonth,
    today: parseIsoDate(getSaoPauloDateISO()),
    investments: investments as PaceInvestmentRow[],
    returns: returns as PaceReturnRow[],
    revisions: (revisions ?? []) as PaceRevisionRow[],
  });
  const projectedById = new Map(
    monthPace.investments.map((item) => [item.investmentId, item.projected]),
  );

  const kpisBase = {
    ...buildKpis(referenceSeries, year, totalInvested),
    // Realizado do ano + projeção do mês + ritmo por dia útil nos meses restantes.
    annualProjection: monthPace.annualProjection,
  };
  const monthlyPositions = Array.isArray(positions) ? positions : [];
  const latestPositionMonth = monthlyPositions.reduce((acc, pos) => {
    const month = Number(pos.month ?? 0);
    if (month > analysisMonth) return acc;
    return month > acc ? month : acc;
  }, 0);
  const currentMarketValue =
    latestPositionMonth > 0
      ? monthlyPositions
          .filter((pos) => Number(pos.month) === latestPositionMonth)
          .reduce((acc, pos) => acc + Number(pos.market_value ?? 0), 0)
      : totalInvested;
  const capitalGain = currentMarketValue - totalInvested;
  const capitalGainPct = totalInvested > 0 ? (capitalGain / totalInvested) * 100 : 0;
  const totalProfit = capitalGain + kpisBase.rolling12Months;
  const totalProfitPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
  const kpis: DashboardPayload["kpis"] = {
    ...kpisBase,
    investedCapital: totalInvested,
    currentMarketValue,
    capitalGain,
    capitalGainPct,
    totalProfit,
    totalProfitPct,
    comparisonBasis: "realized",
    hasActiveFii: monthPace.hasActiveFii,
  };

  // Mês em andamento: momGrowth/yoyGrowth seguem com o realizado; a comparação da projeção vai em projected*.
  const paceEntry = referenceSeries.find(
    (m) => m.year === monthPace.year && m.month === monthPace.month,
  );
  if (monthPace.isCurrentMonth && paceEntry) {
    const prevRef = monthPace.month > 1
      ? { year: monthPace.year, month: monthPace.month - 1 }
      : { year: monthPace.year - 1, month: 12 };
    const previousEntry = referenceSeries.find(
      (m) => m.year === prevRef.year && m.month === prevRef.month,
    );
    const pctVs = (current: number, previous: number | null | undefined): number | null =>
      previous !== null && previous !== undefined && previous > 0
        ? ((current - previous) / previous) * 100
        : null;
    const cdbProjected = monthPace.investments
      .filter((item) => item.type === "CDB")
      .reduce((acc, item) => acc + item.projected, 0);
    const fiiProjected = monthPace.investments
      .filter((item) => item.type === "FII")
      .reduce((acc, item) => acc + item.projected, 0);
    const previousCdbTotal = previousEntry
      ? previousEntry.cdb_items.reduce((acc, item) => acc + item.income, 0)
      : null;

    kpis.comparisonBasis = "projection";
    kpis.projectedCurrentMonth = monthPace.projected;
    kpis.momDeltaValue =
      monthPace.previousMonthTotal !== null ? paceEntry.total - monthPace.previousMonthTotal : null;
    kpis.projectedMomGrowth = monthPace.projectedVsPreviousPercent;
    kpis.projectedMomDelta =
      monthPace.previousMonthTotal !== null ? monthPace.projected - monthPace.previousMonthTotal : null;
    kpis.projectedYoyGrowth = monthPace.yoyPercent;
    kpis.projectedCdbMomGrowth = pctVs(cdbProjected, previousCdbTotal);
    kpis.projectedFiiMomGrowth = pctVs(fiiProjected, previousEntry?.fii_dividends);
    kpis.cdbItems = kpis.cdbItems.map((item) => {
      const projected = projectedById.get(item.investment_id) ?? item.currentMonth;
      const previousIncome = previousEntry?.cdb_items.find(
        (entry) => entry.investment_id === item.investment_id,
      )?.income;
      // momGrowth/momDelta seguem com o realizado; a projeção vai em campos próprios.
      return {
        ...item,
        projectedMonth: projected,
        projectedMomGrowth: pctVs(projected, previousIncome),
        projectedMomDelta: previousEntry ? projected - (previousIncome ?? 0) : null,
      };
    });

    paceEntry.projected_total = monthPace.projected;
  }

  const distribution: IncomeDistribution = (() => {
    const yearData = referenceSeries.filter((m) => m.year === year && m.month <= analysisMonth);
    const cdbTotals = new Map<string, number>();
    for (const cdb of cdbInvestments) {
      cdbTotals.set(cdb.id, 0);
    }
    let fiiTotal = 0;
    for (const m of yearData) {
      for (const item of m.cdb_items) {
        cdbTotals.set(item.investment_id, (cdbTotals.get(item.investment_id) ?? 0) + item.income);
      }
      fiiTotal += m.fii_dividends;
    }
    return {
      cdbItems: cdbInvestments.map((cdb) => ({
        investment_id: cdb.id,
        label: buildInvestmentLabel(cdb),
        value: cdbTotals.get(cdb.id) ?? 0,
      })),
      fii: fiiTotal,
    };
  })();

  const investedByCdb = new Map<string, number>();
  let investedFiis = 0;
  for (const inv of investments) {
    if (inv.type === "CDB") {
      investedByCdb.set(inv.id, (investedByCdb.get(inv.id) ?? 0) + Number(inv.amount_invested ?? 0));
    } else if (inv.type === "FII") {
      investedFiis += Number(inv.amount_invested ?? 0);
    }
  }

  const currentYearSeries = referenceSeries.filter(
    (m) => m.year === year && m.month <= analysisMonth,
  );
  const latestMonthEntry =
    currentYearSeries.length > 0 ? currentYearSeries[currentYearSeries.length - 1] : null;
  const isPaceMonth =
    latestMonthEntry !== null &&
    latestMonthEntry.year === monthPace.year &&
    latestMonthEntry.month === monthPace.month;
  const fiiProjected = monthPace.investments
    .filter((item) => item.type === "FII")
    .reduce((acc, item) => acc + item.projected, 0);

  const monthlyYieldSummary: DashboardPayload["monthlyYieldSummary"] = {
    month: latestMonthEntry?.month ?? null,
    year,
    totalInvested: totalInvested,
    totalMonthlyIncome: latestMonthEntry?.total ?? 0,
    portfolioMonthlyYieldPct:
      totalInvested > 0 && latestMonthEntry
        ? (latestMonthEntry.total / totalInvested) * 100
        : null,
    items: [
      ...cdbInvestments.map((cdb) => {
        const cdbEntry = latestMonthEntry?.cdb_items.find((c) => c.investment_id === cdb.id);
        const realized = cdbEntry?.income ?? 0;
        const forecast =
          latestMonthEntry === null ? null : isPaceMonth ? projectedById.get(cdb.id) ?? realized : realized;
        const invested = investedByCdb.get(cdb.id) ?? 0;
        return {
          key: `cdb_${cdb.id}`,
          label: buildInvestmentLabel(cdb),
          investedAmount: invested,
          monthlyIncome: realized,
          monthlyYieldPct:
            invested > 0 && latestMonthEntry ? (realized / invested) * 100 : null,
          forecastMonthlyIncome: forecast,
          forecastMonthlyYieldPct:
            invested > 0 && forecast !== null ? (forecast / invested) * 100 : null,
        };
      }),
      ...(() => {
        const realized = latestMonthEntry?.fii_dividends ?? 0;
        // FIIs sem posição e sem renda no mês ficam fora do resumo.
        if (investedFiis <= 0 && realized <= 0) return [];
        const forecast =
          latestMonthEntry === null ? null : isPaceMonth ? fiiProjected || realized : realized;
        return [{
          key: "fiis",
          label: "Dividendos FIIs",
          investedAmount: investedFiis,
          monthlyIncome: realized,
          monthlyYieldPct:
            investedFiis > 0 && latestMonthEntry ? (realized / investedFiis) * 100 : null,
          forecastMonthlyIncome: forecast,
          forecastMonthlyYieldPct:
            investedFiis > 0 && forecast !== null ? (forecast / investedFiis) * 100 : null,
        }];
      })(),
    ],
  };

  // Modelos de previsão usam a projeção de fechamento no lugar do mês em andamento.
  const modelSeries = referenceSeries.map((entry) =>
    monthPace.isCurrentMonth && entry.year === monthPace.year && entry.month === monthPace.month
      ? { ...entry, total: monthPace.projected }
      : entry,
  );
  const insights: FinancialInsights = buildInsights(
    kpis,
    distribution,
    modelSeries,
    monthPace,
    cdiAnnualReference,
    fiiTrendSignals,
  );
  const goalProgress = buildGoalProgress(
    monthPace,
    (monthlyGoals ?? []) as Array<{ month: number; monthly_target: number }>,
    referenceSeries,
  );
  const alerts = buildConsistencyAlerts({
    year,
    monthlySeries: referenceSeries,
    analysisMonth,
    monthPace,
  });

  const payload: DashboardPayload = {
    kpis,
    monthPace,
    monthlySeries: referenceSeries.filter((m) => m.year === year && m.month <= analysisMonth),
    yoySeries,
    comparisonByMonth,
    distribution,
    monthlyYieldSummary,
    insights,
    goalProgress,
    alerts,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function buildGoalProgress(
  pace: MonthPace,
  monthlyGoals: Array<{ month: number; monthly_target: number }>,
  series: PassiveIncomeByMonth[],
): GoalProgress {
  const targetByMonth = new Map<number, number>();
  for (const goal of monthlyGoals) {
    const month = Number(goal.month);
    targetByMonth.set(month, (targetByMonth.get(month) ?? 0) + Number(goal.monthly_target ?? 0));
  }
  const goalMonths = Array.from(targetByMonth.entries())
    .filter(([, target]) => target > 0)
    .map(([month]) => month)
    .sort((a, b) => a - b);

  if (goalMonths.length === 0) {
    const annualIncomeTarget = Number(process.env.FINANCEFLOW_ANNUAL_INCOME_TARGET ?? 12000);
    const annualProjection = pace.annualProjection;
    return {
      annualIncomeTarget,
      annualProjection,
      progressPercent:
        annualIncomeTarget > 0 ? Math.max(0, Math.min((annualProjection / annualIncomeTarget) * 100, 999)) : 0,
      gapToTarget: Math.max(annualIncomeTarget - annualProjection, 0),
      onTrack: annualProjection >= annualIncomeTarget,
      source: "env",
      monthsWithGoal: 0,
      remainingMonthsWithGoal: 0,
    };
  }

  // Compara a meta só com os meses que têm meta: realizado, projeção do mês atual ou ritmo por dia útil.
  const projectedPerBusinessDay = pace.projected / pace.totalBusinessDays;
  const totalByMonth = new Map(
    series.filter((entry) => entry.year === pace.year).map((entry) => [entry.month, entry.total]),
  );
  let annualIncomeTarget = 0;
  let annualProjection = 0;
  for (const month of goalMonths) {
    annualIncomeTarget += targetByMonth.get(month) ?? 0;
    if (month < pace.month) {
      annualProjection += totalByMonth.get(month) ?? 0;
    } else if (month === pace.month) {
      annualProjection += pace.projected;
    } else {
      annualProjection += projectedPerBusinessDay * countBusinessDaysInMonth(pace.year, month);
    }
  }

  return {
    annualIncomeTarget,
    annualProjection,
    progressPercent:
      annualIncomeTarget > 0 ? Math.max(0, Math.min((annualProjection / annualIncomeTarget) * 100, 999)) : 0,
    gapToTarget: Math.max(annualIncomeTarget - annualProjection, 0),
    onTrack: annualProjection >= annualIncomeTarget,
    source: "monthly_goals",
    monthsWithGoal: goalMonths.length,
    remainingMonthsWithGoal: goalMonths.filter((month) => month > pace.month).length,
  };
}

function buildConsistencyAlerts({
  year,
  monthlySeries,
  analysisMonth,
  monthPace,
}: {
  year: number;
  monthlySeries: PassiveIncomeByMonth[];
  analysisMonth: number;
  monthPace: MonthPace;
}): ConsistencyAlert[] {
  const alerts: ConsistencyAlert[] = [];
  const yearSeries = monthlySeries.filter((m) => m.year === year);

  if (yearSeries.length === 0) {
    alerts.push({
      code: "NO_DATA_YEAR",
      severity: "warning",
      message: `Nenhum lançamento encontrado para ${year}.`,
    });
    return alerts;
  }

  const now = new Date();
  const currentContextMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const maxMonth = Math.min(currentContextMonth, analysisMonth);
  const monthsWithData = new Set(yearSeries.map((m) => m.month));
  const missingMonths: number[] = [];
  for (let month = 1; month <= maxMonth; month++) {
    if (!monthsWithData.has(month)) {
      missingMonths.push(month);
    }
  }
  if (missingMonths.length > 0) {
    alerts.push({
      code: "MISSING_MONTHS",
      severity: "warning",
      message: `${missingMonths.length} mês(es) sem lançamento em ${year} até agora.`,
    });
  }

  // No mês em andamento, compara a projeção de fechamento (e não o parcial) com meses cheios.
  const projectionLabel = monthPace.isCurrentMonth ? " (projeção do mês)" : "";
  const momPercent = monthPace.projectedVsPreviousPercent;
  if (momPercent !== null && momPercent <= -15) {
    alerts.push({
      code: "MOM_SHARP_DROP",
      severity: "critical",
      message: `Queda forte no mês${projectionLabel}: ${momPercent.toFixed(1)}% vs mês anterior.`,
    });
  }

  const yoyPercent = monthPace.yoyPercent;
  if (yoyPercent !== null && yoyPercent < 0) {
    alerts.push({
      code: "YOY_NEGATIVE",
      severity: "warning",
      message: `Comparativo anual negativo${projectionLabel}: ${yoyPercent.toFixed(1)}%.`,
    });
  }

  return alerts;
}

function buildInsights(
  kpis: DashboardPayload["kpis"],
  distribution: IncomeDistribution,
  monthlySeries: PassiveIncomeByMonth[],
  monthPace: MonthPace,
  cdiAnnualReference: number,
  fiiTrendSignals: {
    selicMetaPercent: number;
    ipca12mPercent: number;
    selicTrend3mPercent: number | null;
    ipcaTrend3mPercent: number | null;
  },
): FinancialInsights {
  const totalCdb = distribution.cdbItems.reduce((acc, c) => acc + c.value, 0);
  const totalFii = distribution.fii;
  const ratio = totalCdb > 0 ? (totalFii / totalCdb) * 100 : 0;

  let bestSource: string = "FII";
  let bestValue = totalFii;
  for (const item of distribution.cdbItems) {
    if (item.value > bestValue) {
      bestValue = item.value;
      bestSource = item.label;
    }
  }

  // Variação de até ±3% por dia útil é tratada como estabilidade.
  const paceDelta = monthPace.paceDeltaPercent;
  const trend =
    paceDelta !== null && paceDelta > 3
      ? "alta"
      : paceDelta !== null && paceDelta < -3
        ? "queda"
        : "estável";

  const allOrdered = [...monthlySeries].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );
  const histForModel = allOrdered.slice(-24);
  const recentForVol = histForModel.slice(-6).map((m) => m.total);
  const weightedBase = weightedMovingAverage(histForModel.map((m) => m.total));
  const currentMonth = allOrdered.length
    ? allOrdered[allOrdered.length - 1].month
    : new Date().getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const seasonalityFactor = computeSeasonalityFactor(allOrdered, nextMonth);
  // Run-rate por dia útil do mês analisado × dias úteis do próximo mês; média ponderada como fallback.
  const nextMonthYear = monthPace.month === 12 ? monthPace.year + 1 : monthPace.year;
  const runRateForecast =
    monthPace.projected > 0
      ? (monthPace.projected / monthPace.totalBusinessDays) *
        countBusinessDaysInMonth(nextMonthYear, nextMonth) *
        seasonalityFactor
      : null;
  const forecastNextMonth = Math.max(runRateForecast ?? weightedBase * seasonalityFactor, 0);
  const { stdDev, cvPercent } = summarizeVolatility(recentForVol);
  const forecastConfidence = computeForecastConfidence(histForModel.length, cvPercent);
  const bandScale = Math.max(0.05, (100 - forecastConfidence) / 100);
  const rangeWidth = Math.max(stdDev, forecastNextMonth * bandScale);
  const forecastRangeMin = Math.max(forecastNextMonth - rangeWidth, 0);
  const forecastRangeMax = forecastNextMonth + rangeWidth;

  const anomaly = monthPace.anomaly;

  const commentary = anomaly.detected
    ? `Alerta de anomalia no mês atual: ${anomaly.reason}. A previsão do próximo mês é de aproximadamente R$ ${forecastNextMonth.toFixed(2)}.`
    : `Sua renda passiva está ${trend === "estável" ? "estável" : `em ${trend}`}. A previsão do próximo mês é de aproximadamente R$ ${forecastNextMonth.toFixed(2)}.`;

  return {
    growthTrend: trend,
    bestSource,
    fiiToCdbRatio: ratio,
    cdiAnnualReference,
    fiiReinvestment: deriveFiiReinvestmentSuggestion(
      cdiAnnualReference,
      fiiTrendSignals,
    ),
    forecastNextMonth,
    forecastRangeMin,
    forecastRangeMax,
    forecastConfidence,
    seasonalityFactor,
    volatilityPercent: cvPercent,
    anomalyDetected: anomaly.detected,
    anomalyReason: anomaly.reason,
    commentary,
  };
}

function parseBcbSeriesValues(payload: BcbSeriesPoint[]): number[] {
  return payload
    .map((point) => Number((point.valor ?? "").replace(",", ".")))
    .filter((value) => Number.isFinite(value));
}

function formatBcbDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function buildBcbSeriesDateRangeUrl(seriesCode: number, lookbackDays: number): string {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - lookbackDays);
  const params = new URLSearchParams({
    formato: "json",
    dataInicial: formatBcbDate(startDate),
    dataFinal: formatBcbDate(endDate),
  });
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados?${params.toString()}`;
}

async function fetchBcbSeries(url: string): Promise<number[]> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    timeout = setTimeout(() => controller.abort(), 1800);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`BCB status ${response.status}`);
    }
    const payload = (await response.json()) as BcbSeriesPoint[];
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error("BCB payload vazio");
    }
    const values = parseBcbSeriesValues(payload);
    if (values.length === 0) {
      throw new Error("BCB sem valores válidos");
    }
    return values;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function resolveFiiMarketTrendSignals(): Promise<{
  selicMetaPercent: number;
  ipca12mPercent: number;
  selicTrend3mPercent: number | null;
  ipcaTrend3mPercent: number | null;
}> {
  const now = Date.now();
  if (fiiTrendCache && fiiTrendCache.expiresAt > now) {
    return fiiTrendCache.value;
  }

  const fallbackSelic = Number(process.env.FINANCEFLOW_SELIC_META_FALLBACK ?? 10.5);
  const fallbackIpca12m = Number(process.env.FINANCEFLOW_IPCA12M_FALLBACK ?? 4.5);
  const safeFallbackSelic =
    Number.isFinite(fallbackSelic) && fallbackSelic > 0 ? fallbackSelic : 10.5;
  const safeFallbackIpca12m =
    Number.isFinite(fallbackIpca12m) && fallbackIpca12m > 0 ? fallbackIpca12m : 4.5;

  try {
    const [selicValues, ipcaValues] = await Promise.all([
      fetchBcbSeries(buildBcbSeriesDateRangeUrl(432, SELIC_TREND_LOOKBACK_DAYS)),
      fetchBcbSeries(IPCA_12M_SERIES_URL),
    ]);

    const selicMetaPercent = selicValues[selicValues.length - 1] ?? safeFallbackSelic;
    const ipca12mPercent = ipcaValues[ipcaValues.length - 1] ?? safeFallbackIpca12m;
    const selicBase = selicValues[0] ?? selicMetaPercent;
    const ipcaBase =
      ipcaValues.length >= 4 ? ipcaValues[ipcaValues.length - 4] : ipcaValues[0] ?? ipca12mPercent;
    const selicTrend3mPercent =
      selicValues.length >= 2 ? selicMetaPercent - selicBase : null;
    const ipcaTrend3mPercent =
      ipcaValues.length >= 2 ? ipca12mPercent - ipcaBase : null;

    const value = {
      selicMetaPercent,
      ipca12mPercent,
      selicTrend3mPercent,
      ipcaTrend3mPercent,
    };

    fiiTrendCache = {
      value,
      expiresAt: now + FII_TREND_CACHE_SUCCESS_TTL_MS,
    };
    return value;
  } catch (error) {
    console.warn("Falha ao obter sinais de mercado para FIIs no BCB, usando fallback.", error);
    const value = {
      selicMetaPercent: safeFallbackSelic,
      ipca12mPercent: safeFallbackIpca12m,
      selicTrend3mPercent: null,
      ipcaTrend3mPercent: null,
    };
    fiiTrendCache = {
      value,
      expiresAt: now + FII_TREND_CACHE_FALLBACK_TTL_MS,
    };
    return value;
  }
}

function deriveFiiReinvestmentSuggestion(
  cdiAnnualReference: number,
  trendSignals: {
    selicMetaPercent: number;
    ipca12mPercent: number;
    selicTrend3mPercent: number | null;
    ipcaTrend3mPercent: number | null;
  },
): FinancialInsights["fiiReinvestment"] {
  const realRatePercent = cdiAnnualReference - trendSignals.ipca12mPercent;
  const realRateAdj = clamp((realRatePercent - 4) * 2.5, -15, 20);
  const selicTrendAdj = clamp((trendSignals.selicTrend3mPercent ?? 0) * 3.5, -12, 12);
  const ipcaTrendAdj = clamp((trendSignals.ipcaTrend3mPercent ?? 0) * 2.1, -8, 8);
  const ipcaLevelAdj = clamp((trendSignals.ipca12mPercent - 4.5) * 1.2, -6, 10);

  const paperRaw = 50 + realRateAdj + selicTrendAdj + ipcaTrendAdj + ipcaLevelAdj;
  const papelPercent = Math.round(clamp(paperRaw, 25, 75));
  const tijoloPercent = 100 - papelPercent;

  const alignmentSignals = [
    realRatePercent >= 5 ? 1 : realRatePercent <= 3 ? -1 : 0,
    (trendSignals.selicTrend3mPercent ?? 0) >= 0.15
      ? 1
      : (trendSignals.selicTrend3mPercent ?? 0) <= -0.15
        ? -1
        : 0,
    (trendSignals.ipcaTrend3mPercent ?? 0) >= 0.25
      ? 1
      : (trendSignals.ipcaTrend3mPercent ?? 0) <= -0.25
        ? -1
        : 0,
  ];
  const alignmentScore = Math.abs(alignmentSignals.reduce((acc, value) => acc + value, 0));
  const adjustmentMagnitude =
    Math.abs(realRateAdj) + Math.abs(selicTrendAdj) + Math.abs(ipcaTrendAdj) + Math.abs(ipcaLevelAdj);
  const confidencePercent = Math.round(
    clamp(45 + adjustmentMagnitude * 1.1 + alignmentScore * 6, 45, 90),
  );

  let marketRegime: FinancialInsights["fiiReinvestment"]["marketRegime"] = "EQUILIBRADO";
  if (realRatePercent >= 6 && (trendSignals.selicTrend3mPercent ?? 0) >= 0) {
    marketRegime = "JUROS_RESTRITIVOS";
  } else if ((trendSignals.selicTrend3mPercent ?? 0) <= -0.4 && realRatePercent <= 5) {
    marketRegime = "AFROUXAMENTO_MONETARIO";
  } else if (
    (trendSignals.ipcaTrend3mPercent ?? 0) >= 0.3 ||
    trendSignals.ipca12mPercent >= 5.5
  ) {
    marketRegime = "INFLACAO_REACELERANDO";
  }

  const drivers = [
    { key: "realRate", value: realRateAdj },
    { key: "selicTrend", value: selicTrendAdj },
    { key: "ipcaTrend", value: ipcaTrendAdj },
    { key: "ipcaLevel", value: ipcaLevelAdj },
  ]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 2);

  const driverText = drivers
    .map((driver) => {
      if (driver.key === "realRate") {
        return `juro real em ${realRatePercent.toFixed(2)}%`;
      }
      if (driver.key === "selicTrend") {
        return `Selic 3M em ${
          trendSignals.selicTrend3mPercent === null
            ? "estável"
            : `${trendSignals.selicTrend3mPercent >= 0 ? "+" : ""}${trendSignals.selicTrend3mPercent.toFixed(2)} p.p.`
        }`;
      }
      if (driver.key === "ipcaTrend") {
        return `IPCA 12M 3M em ${
          trendSignals.ipcaTrend3mPercent === null
            ? "estável"
            : `${trendSignals.ipcaTrend3mPercent >= 0 ? "+" : ""}${trendSignals.ipcaTrend3mPercent.toFixed(2)} p.p.`
        }`;
      }
      return `IPCA 12M em ${trendSignals.ipca12mPercent.toFixed(2)}%`;
    })
    .join(" e ");

  const rationale = `Proporção derivada por regime macro (BCB): ${driverText}. Papel ganha peso em ambiente de juro real alto/pressão inflacionária; Tijolo ganha peso quando juros reais aliviam e ciclo monetário afrouxa.`;

  return {
    tijoloPercent,
    papelPercent,
    confidencePercent,
    marketRegime,
    realRatePercent,
    selicMetaPercent: trendSignals.selicMetaPercent,
    ipca12mPercent: trendSignals.ipca12mPercent,
    selicTrend3mPercent: trendSignals.selicTrend3mPercent,
    ipcaTrend3mPercent: trendSignals.ipcaTrend3mPercent,
    rationale,
    updatedAt: new Date().toISOString(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function weightedMovingAverage(values: number[]): number {
  if (!values.length) return 0;
  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i++) {
    const weight = i + 1;
    weighted += values[i] * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weighted / weightSum : 0;
}

function computeSeasonalityFactor(
  series: PassiveIncomeByMonth[],
  month: number,
): number {
  if (!series.length) return 1;
  const globalAvg =
    series.reduce((acc, item) => acc + item.total, 0) / series.length;
  if (globalAvg <= 0) return 1;
  const sameMonth = series.filter((item) => item.month === month);
  if (sameMonth.length < 2) return 1;
  const sameMonthAvg =
    sameMonth.reduce((acc, item) => acc + item.total, 0) / sameMonth.length;
  const factor = sameMonthAvg / globalAvg;
  return Math.max(0.7, Math.min(1.3, factor));
}

function summarizeVolatility(values: number[]): {
  stdDev: number;
  cvPercent: number;
} {
  if (!values.length) return { stdDev: 0, cvPercent: 0 };
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cvPercent = mean > 0 ? (stdDev / mean) * 100 : 0;
  return {
    stdDev,
    cvPercent: Number.isFinite(cvPercent) ? cvPercent : 0,
  };
}

function computeForecastConfidence(sampleSize: number, cvPercent: number): number {
  const samplePenalty = Math.max(0, 10 - sampleSize) * 3;
  const raw = 96 - cvPercent - samplePenalty;
  return Math.max(35, Math.min(95, raw));
}

