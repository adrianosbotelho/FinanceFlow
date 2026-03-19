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

const FALLBACK_CDI_ANNUAL_RATE = 10.65;
const CDI_SERIES_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json";
const IPCA_12M_SERIES_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/12?formato=json";
const SELIC_TREND_LOOKBACK_DAYS = 120;
const CDI_CACHE_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const CDI_CACHE_FALLBACK_TTL_MS = 30 * 60 * 1000;
const FII_TREND_CACHE_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const FII_TREND_CACHE_FALLBACK_TTL_MS = 30 * 60 * 1000;

let cdiAnnualCache: { value: number; expiresAt: number } | null = null;
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

function countBusinessDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

function countBusinessDaysElapsedInMonth(year: number, month: number, dayLimit: number): number {
  let count = 0;
  for (let day = 1; day <= dayLimit; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const cdiAnnualPromise = resolveCdiAnnualReference();
  const fiiTrendSignalsPromise = resolveFiiMarketTrendSignals();

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

  const [cdiAnnualReference, fiiTrendSignals] = await Promise.all([
    cdiAnnualPromise,
    fiiTrendSignalsPromise,
  ]);

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

  const investedByTheme = investments.reduce(
    (acc, inv) => {
      const amount = Number(inv.amount_invested ?? 0);
      if (inv.type === "CDB") {
        if (isItauInstitution(inv.institution)) {
          acc.cdb_itau += amount;
        } else {
          acc.cdb_santander += amount;
        }
      } else if (inv.type === "FII") {
        acc.fiis += amount;
      }
      return acc;
    },
    { cdb_itau: 0, cdb_santander: 0, fiis: 0 },
  );

  const currentYearSeries = monthlySeries.filter((m) => m.year === year);
  const latestMonthEntry =
    currentYearSeries.length > 0 ? currentYearSeries[currentYearSeries.length - 1] : null;
  const now = new Date();
  const isCurrentContextMonth =
    latestMonthEntry !== null &&
    year === now.getFullYear() &&
    latestMonthEntry.month === now.getMonth() + 1;
  const elapsedBusinessDays = isCurrentContextMonth
    ? countBusinessDaysElapsedInMonth(year, latestMonthEntry.month, now.getDate())
    : null;
  const totalBusinessDays = isCurrentContextMonth
    ? countBusinessDaysInMonth(year, latestMonthEntry.month)
    : null;
  const paceFactor =
    elapsedBusinessDays !== null &&
    totalBusinessDays !== null &&
    elapsedBusinessDays > 0
      ? totalBusinessDays / elapsedBusinessDays
      : null;

  function resolveForecastIncome(realizedIncome: number): number | null {
    if (realizedIncome < 0) return null;
    if (paceFactor !== null) return realizedIncome * paceFactor;
    return realizedIncome;
  }

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
      (() => {
        const realized = latestMonthEntry?.cdb_itau ?? 0;
        const forecast = latestMonthEntry !== null ? resolveForecastIncome(realized) : null;
        return {
        key: "cdb_itau",
        label: "CDB Itaú",
        investedAmount: investedByTheme.cdb_itau,
        monthlyIncome: realized,
        monthlyYieldPct:
          investedByTheme.cdb_itau > 0 && latestMonthEntry
            ? (realized / investedByTheme.cdb_itau) * 100
            : null,
        forecastMonthlyIncome: forecast,
        forecastMonthlyYieldPct:
          investedByTheme.cdb_itau > 0 && forecast !== null
            ? (forecast / investedByTheme.cdb_itau) * 100
            : null,
      };
      })(),
      (() => {
        const realized = latestMonthEntry?.cdb_other ?? 0;
        const forecast = latestMonthEntry !== null ? resolveForecastIncome(realized) : null;
        return {
        key: "cdb_santander",
        label: "CDB Santander",
        investedAmount: investedByTheme.cdb_santander,
        monthlyIncome: realized,
        monthlyYieldPct:
          investedByTheme.cdb_santander > 0 && latestMonthEntry
            ? (realized / investedByTheme.cdb_santander) * 100
            : null,
        forecastMonthlyIncome: forecast,
        forecastMonthlyYieldPct:
          investedByTheme.cdb_santander > 0 && forecast !== null
            ? (forecast / investedByTheme.cdb_santander) * 100
            : null,
      };
      })(),
      (() => {
        const realized = latestMonthEntry?.fii_dividends ?? 0;
        const forecast = latestMonthEntry !== null ? resolveForecastIncome(realized) : null;
        return {
        key: "fiis",
        label: "Dividendos FIIs",
        investedAmount: investedByTheme.fiis,
        monthlyIncome: realized,
        monthlyYieldPct:
          investedByTheme.fiis > 0 && latestMonthEntry
            ? (realized / investedByTheme.fiis) * 100
            : null,
        forecastMonthlyIncome: forecast,
        forecastMonthlyYieldPct:
          investedByTheme.fiis > 0 && forecast !== null
            ? (forecast / investedByTheme.fiis) * 100
            : null,
      };
      })(),
    ],
  };

  const insights: FinancialInsights = buildInsights(
    kpis,
    distribution,
    monthlySeries,
    year,
    cdiAnnualReference,
    fiiTrendSignals,
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
  cdiAnnualReference: number,
  fiiTrendSignals: {
    selicMetaPercent: number;
    ipca12mPercent: number;
    selicTrend3mPercent: number | null;
    ipcaTrend3mPercent: number | null;
  },
): FinancialInsights {
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

function resolveEnvCdiAnnualFallback(): number {
  const cdiEnv = Number(process.env.FINANCEFLOW_CDI_ANNUAL_RATE ?? FALLBACK_CDI_ANNUAL_RATE);
  return Number.isFinite(cdiEnv) && cdiEnv > 0 ? cdiEnv : FALLBACK_CDI_ANNUAL_RATE;
}

function annualizeDailyRate(dailyRatePercent: number): number {
  return (Math.pow(1 + dailyRatePercent / 100, 252) - 1) * 100;
}

async function resolveCdiAnnualReference(): Promise<number> {
  const now = Date.now();
  if (cdiAnnualCache && cdiAnnualCache.expiresAt > now) {
    return cdiAnnualCache.value;
  }

  const fallback = resolveEnvCdiAnnualFallback();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 1800);
    const response = await fetch(CDI_SERIES_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (timeout) clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`BCB status ${response.status}`);
    }

    const payload = (await response.json()) as BcbSeriesPoint[];
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error("BCB payload vazio");
    }

    const latestPoint = [...payload]
      .reverse()
      .find((point) => Number.isFinite(Number((point.valor ?? "").replace(",", "."))));
    if (!latestPoint?.valor) {
      throw new Error("BCB sem valor válido");
    }

    const dailyRate = Number(latestPoint.valor.replace(",", "."));
    if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
      throw new Error("Taxa CDI diária inválida");
    }

    const annualized = annualizeDailyRate(dailyRate);
    if (!Number.isFinite(annualized) || annualized <= 0) {
      throw new Error("Taxa CDI anualizada inválida");
    }

    cdiAnnualCache = {
      value: annualized,
      expiresAt: now + CDI_CACHE_SUCCESS_TTL_MS,
    };

    return annualized;
  } catch (error) {
    console.warn("Falha ao obter CDI no BCB, usando fallback local.", error);
    cdiAnnualCache = {
      value: fallback,
      expiresAt: now + CDI_CACHE_FALLBACK_TTL_MS,
    };
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
