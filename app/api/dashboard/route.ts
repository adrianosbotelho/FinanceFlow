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

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isItauInstitution(institution: string): boolean {
  const normalized = institution
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.includes("itau");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  const [
    { data: investments, error: invError },
    { data: returns, error: retError },
    { data: positions, error: posError },
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
  ]);

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

  const byInvestment = new Map<string, (typeof investments)[number]>();
  for (const inv of investments) {
    byInvestment.set(inv.id, inv);
  }

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
        cdb_itau: 0,
        cdb_other: 0,
        fii_dividends: 0,
        total: 0,
      };
      seriesMap.set(key, bucket);
    }

    if (inv.type === "CDB") {
      if (isItauInstitution(inv.institution)) {
        bucket.cdb_itau += Number(row.income_value);
      } else {
        bucket.cdb_other += Number(row.income_value);
      }
    } else if (inv.type === "FII") {
      bucket.fii_dividends += Number(row.income_value);
    }

    bucket.total =
      bucket.cdb_itau + bucket.cdb_other + bucket.fii_dividends;
  }

  const monthlySeries = Array.from(seriesMap.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );

  const byYearMonth = new Map<string, PassiveIncomeByMonth>();
  for (const m of monthlySeries) {
    byYearMonth.set(`${m.year}-${m.month}`, m);
  }

  const yearPrev = year - 1;
  const comparisonByMonth: MonthComparisonPoint[] = Array.from(
    { length: 12 },
    (_, i) => {
      const month = i + 1;
      const prev = byYearMonth.get(`${yearPrev}-${month}`);
      const curr = byYearMonth.get(`${year}-${month}`);
      return {
        month,
        monthName: monthLabel(month),
        yearPrev,
        yearCurr: year,
        itauPrev: prev?.cdb_itau ?? 0,
        itauCurr: curr?.cdb_itau ?? 0,
        otherCdbPrev: prev?.cdb_other ?? 0,
        otherCdbCurr: curr?.cdb_other ?? 0,
        fiiPrev: prev?.fii_dividends ?? 0,
        fiiCurr: curr?.fii_dividends ?? 0,
        totalPrev: prev?.total ?? 0,
        totalCurr: curr?.total ?? 0,
      };
    },
  );

  const yoySeries = monthlySeries.filter((m) => m.year === year);

  const totalInvested = investments.reduce(
    (acc, inv) => acc + Number(inv.amount_invested),
    0,
  );

  const kpisBase = buildKpis(monthlySeries, year, totalInvested);
  const monthlyPositions = Array.isArray(positions) ? positions : [];
  const latestPositionMonth = monthlyPositions.reduce((acc, pos) => {
    const month = Number(pos.month ?? 0);
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
  const kpis = {
    ...kpisBase,
    investedCapital: totalInvested,
    currentMarketValue,
    capitalGain,
    capitalGainPct,
    totalProfit,
    totalProfitPct,
  };

  const distribution: IncomeDistribution = monthlySeries
    .filter((m) => m.year === year)
    .reduce(
      (acc, m) => {
        acc.itauCdb += m.cdb_itau;
        acc.otherCdb += m.cdb_other;
        acc.fii += m.fii_dividends;
        return acc;
      },
      { itauCdb: 0, otherCdb: 0, fii: 0 },
    );

  const insights: FinancialInsights = buildInsights(
    kpis,
    distribution,
    monthlySeries,
    year,
  );
  const goalProgress = buildGoalProgress(kpis);
  const alerts = buildConsistencyAlerts({
    year,
    monthlySeries,
    kpis,
  });

  const payload: DashboardPayload = {
    kpis,
    monthlySeries: monthlySeries.filter((m) => m.year === year),
    yoySeries,
    comparisonByMonth,
    distribution,
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

function buildGoalProgress(kpis: DashboardPayload["kpis"]): GoalProgress {
  const annualIncomeTarget = Number(
    process.env.FINANCEFLOW_ANNUAL_INCOME_TARGET ?? 12000,
  );
  const annualProjection = kpis.annualProjection;
  const progressPercent =
    annualIncomeTarget > 0
      ? Math.max(0, Math.min((annualProjection / annualIncomeTarget) * 100, 999))
      : 0;
  const gapToTarget = Math.max(annualIncomeTarget - annualProjection, 0);

  return {
    annualIncomeTarget,
    annualProjection,
    progressPercent,
    gapToTarget,
    onTrack: annualProjection >= annualIncomeTarget,
  };
}

function buildConsistencyAlerts({
  year,
  monthlySeries,
  kpis,
}: {
  year: number;
  monthlySeries: PassiveIncomeByMonth[];
  kpis: DashboardPayload["kpis"];
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
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
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

  if (kpis.momGrowth !== null && kpis.momGrowth <= -15) {
    alerts.push({
      code: "MOM_SHARP_DROP",
      severity: "critical",
      message: `Queda forte no mês: ${kpis.momGrowth.toFixed(1)}% vs mês anterior.`,
    });
  }

  if (kpis.yoyGrowth !== null && kpis.yoyGrowth < 0) {
    alerts.push({
      code: "YOY_NEGATIVE",
      severity: "warning",
      message: `Comparativo anual negativo: ${kpis.yoyGrowth.toFixed(1)}%.`,
    });
  }

  return alerts;
}

function buildInsights(
  kpis: DashboardPayload["kpis"],
  distribution: IncomeDistribution,
  monthlySeries: PassiveIncomeByMonth[],
  year: number,
): FinancialInsights {
  const cdiEnv = Number(process.env.FINANCEFLOW_CDI_ANNUAL_RATE ?? 10.65);
  const cdiAnnualReference =
    Number.isFinite(cdiEnv) && cdiEnv > 0 ? cdiEnv : 10.65;
  const totalCdb = distribution.itauCdb + distribution.otherCdb;
  const totalFii = distribution.fii;
  const ratio = totalCdb > 0 ? (totalFii / totalCdb) * 100 : 0;

  let bestSource: FinancialInsights["bestSource"] = "FII";
  if (distribution.itauCdb >= distribution.otherCdb && distribution.itauCdb >= totalFii) {
    bestSource = "CDB_ITAU";
  } else if (
    distribution.otherCdb > distribution.itauCdb &&
    distribution.otherCdb >= totalFii
  ) {
    bestSource = "CDB_OTHER";
  }

  const trend =
    kpis.momGrowth && kpis.momGrowth > 0
      ? "alta"
      : kpis.momGrowth && kpis.momGrowth < 0
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
  const forecastNextMonth = Math.max(weightedBase * seasonalityFactor, 0);
  const { stdDev, cvPercent } = summarizeVolatility(recentForVol);
  const forecastConfidence = computeForecastConfidence(histForModel.length, cvPercent);
  const bandScale = Math.max(0.05, (100 - forecastConfidence) / 100);
  const rangeWidth = Math.max(stdDev, forecastNextMonth * bandScale);
  const forecastRangeMin = Math.max(forecastNextMonth - rangeWidth, 0);
  const forecastRangeMax = forecastNextMonth + rangeWidth;

  const anomaly = detectAnomaly(allOrdered, year);

  const commentary = anomaly.detected
    ? `Alerta de anomalia no mês atual: ${anomaly.reason}. A previsão do próximo mês é de aproximadamente R$ ${forecastNextMonth.toFixed(2)}.`
    : `Sua renda passiva está em ${trend}. A previsão do próximo mês é de aproximadamente R$ ${forecastNextMonth.toFixed(2)}.`;

  return {
    growthTrend: trend,
    bestSource,
    fiiToCdbRatio: ratio,
    cdiAnnualReference,
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

function detectAnomaly(
  series: PassiveIncomeByMonth[],
  year: number,
): { detected: boolean; reason: string | null } {
  const yearSeries = series.filter((item) => item.year === year);
  if (yearSeries.length < 2) return { detected: false, reason: null };
  const current = yearSeries[yearSeries.length - 1];
  const baseline = series
    .filter((item) => item.year < current.year || item.month < current.month)
    .slice(-6)
    .map((item) => item.total);
  if (baseline.length < 3) return { detected: false, reason: null };
  const { stdDev } = summarizeVolatility(baseline);
  if (stdDev <= 0) return { detected: false, reason: null };
  const mean = baseline.reduce((acc, v) => acc + v, 0) / baseline.length;
  const zScore = (current.total - mean) / stdDev;
  if (zScore <= -2) {
    return {
      detected: true,
      reason: "queda fora do padrão histórico recente",
    };
  }
  if (zScore >= 2) {
    return {
      detected: true,
      reason: "alta fora do padrão histórico recente",
    };
  }
  return { detected: false, reason: null };
}
