import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { formatCurrencyBRL, monthLabel } from "../../../../lib/formatters";
import { ProfessionalInsightsPayload } from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BCB_CDI_DAILY_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json";
const YAHOO_IBOV_MONTHLY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=2y&interval=1mo";
const YAHOO_IFIX_MONTHLY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/IFIX.SA?range=2y&interval=1mo";
const EXTERNAL_FETCH_TIMEOUT_MS = 5000;

type InvestmentRow = {
  id: string;
  type: "CDB" | "FII";
  institution: string;
  amount_invested: number;
};

type ReturnRow = {
  investment_id: string;
  year: number;
  month: number;
  income_value: number;
  created_at?: string | null;
};

type BcbPoint = { valor?: string };
type YahooChartPayload = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

type ProfessionalRunRow = {
  run_date: string;
  year: number;
  month: number;
  hit_rate_percent: number | null;
  cumulative_edge_value: number;
  risk_score: number;
  risk_regime: "ESTAVEL" | "ATENCAO" | "ESTRESSADO";
  headline: string;
};

type Bucket = {
  year: number;
  month: number;
  cdb_itau: number;
  cdb_santander: number;
  fiis: number;
  total: number;
  latestEntryAt: string | null;
};

function isItauInstitution(institution: string): boolean {
  const normalized = institution
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.includes("itau");
}

function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toMaybeNum(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : null;
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

function getSaoPauloDateISO(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

function isMissingTableError(message: string | undefined, table: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, curr) => acc + curr, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, curr) => acc + (curr - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || Math.abs(previous) < 0.000001) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function rollingAverage(values: number[], count: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(Math.max(0, values.length - count));
  return mean(slice);
}

function annualizeDailyRate(dailyRatePercent: number): number {
  return (Math.pow(1 + dailyRatePercent / 100, 252) - 1) * 100;
}

function monthlyEquivalentFromAnnualRate(annualRatePercent: number): number {
  return (Math.pow(1 + annualRatePercent / 100, 1 / 12) - 1) * 100;
}

function erfApprox(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erfApprox(x / Math.SQRT2));
}

function probabilityToReachTarget(
  target: number | null,
  projected: number,
  sigma: number,
): number | null {
  if (target === null || target <= 0) return null;
  if (!Number.isFinite(sigma) || sigma <= 0) {
    return projected >= target ? 100 : 0;
  }
  const z = (target - projected) / sigma;
  const prob = (1 - normalCdf(z)) * 100;
  return Math.max(0, Math.min(100, prob));
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

function buildBucketSeries(investments: InvestmentRow[], returns: ReturnRow[]): Bucket[] {
  const invById = new Map<string, InvestmentRow>(investments.map((inv) => [inv.id, inv]));
  const byMonth = new Map<string, Bucket>();

  for (const row of returns) {
    const inv = invById.get(row.investment_id);
    if (!inv) continue;
    const key = monthKey(row.year, row.month);
    let bucket = byMonth.get(key);
    if (!bucket) {
      bucket = {
        year: row.year,
        month: row.month,
        cdb_itau: 0,
        cdb_santander: 0,
        fiis: 0,
        total: 0,
        latestEntryAt: null,
      };
      byMonth.set(key, bucket);
    }

    const income = toNum(row.income_value);
    if (inv.type === "FII") {
      bucket.fiis += income;
    } else if (isItauInstitution(inv.institution)) {
      bucket.cdb_itau += income;
    } else {
      bucket.cdb_santander += income;
    }

    bucket.total = bucket.cdb_itau + bucket.cdb_santander + bucket.fiis;
    const createdAt = row.created_at ?? null;
    if (createdAt && (!bucket.latestEntryAt || createdAt > bucket.latestEntryAt)) {
      bucket.latestEntryAt = createdAt;
    }
  }

  return Array.from(byMonth.values()).sort((a, b) => a.year - b.year || a.month - b.month);
}

type ForecastKey = "cdb_itau" | "cdb_santander" | "fiis" | "total";
type AssetKey = "cdb_itau" | "cdb_santander" | "fiis";
const ASSET_KEYS: AssetKey[] = ["cdb_itau", "cdb_santander", "fiis"];
const ASSET_LABELS: Record<AssetKey, string> = {
  cdb_itau: "CDB Itaú",
  cdb_santander: "CDB Santander",
  fiis: "Dividendos FIIs",
};

function buildForecastMetric(
  series: Bucket[],
  key: ForecastKey,
  year: number,
  month: number,
  label: string,
) {
  const errors: number[] = [];
  const absErrors: number[] = [];
  const absPctErrors: number[] = [];
  let directionHits = 0;
  let sampleSize = 0;

  for (let i = 3; i < series.length; i += 1) {
    const point = series[i];
    if (point.year !== year || point.month > month) continue;

    const history = [series[i - 1][key], series[i - 2][key], series[i - 3][key]];
    const forecast = mean(history);
    const actual = point[key];
    const prevActual = series[i - 1][key];
    const error = actual - forecast;
    const denominator = Math.max(Math.abs(actual), 1);

    errors.push(error);
    absErrors.push(Math.abs(error));
    absPctErrors.push(Math.abs(error) / denominator);
    sampleSize += 1;

    const predDelta = forecast - prevActual;
    const realDelta = actual - prevActual;
    const predSign = Math.sign(Math.abs(predDelta) < 0.01 ? 0 : predDelta);
    const realSign = Math.sign(Math.abs(realDelta) < 0.01 ? 0 : realDelta);
    if (predSign === realSign) directionHits += 1;
  }

  return {
    key,
    label,
    sampleSize,
    mapePercent: sampleSize > 0 ? mean(absPctErrors) * 100 : null,
    maeValue: sampleSize > 0 ? mean(absErrors) : null,
    biasValue: sampleSize > 0 ? mean(errors) : null,
    directionAccuracyPercent: sampleSize > 0 ? (directionHits / sampleSize) * 100 : null,
  };
}

function previousMonthOf(year: number, month: number): { year: number; month: number } {
  if (month > 1) return { year, month: month - 1 };
  return { year: year - 1, month: 12 };
}

function findBucket(series: Bucket[], year: number, month: number): Bucket | null {
  return series.find((item) => item.year === year && item.month === month) ?? null;
}

function safeBand(base: number, sigma: number): { pessimistic: number; base: number; optimistic: number } {
  const delta = Math.abs(sigma);
  return {
    pessimistic: Math.max(0, base - delta),
    base: Math.max(0, base),
    optimistic: Math.max(0, base + delta),
  };
}

function pickLatestTimestamp(series: Bucket[]): string | null {
  let latest: string | null = null;
  for (const point of series) {
    if (point.latestEntryAt && (!latest || point.latestEntryAt > latest)) {
      latest = point.latestEntryAt;
    }
  }
  return latest;
}

function monthSequence(start: number, end: number): number[] {
  const values: number[] = [];
  for (let month = start; month <= end; month += 1) values.push(month);
  return values;
}

function linearSlope(values: number[]): number {
  if (values.length <= 1) return 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }
  if (Math.abs(denominator) < 0.000001) return 0;
  return numerator / denominator;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (FinanceFlow Insights Professional)",
      },
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function fetchDiagnosisHistory(
  year: number,
  month: number,
): Promise<{ history: ProfessionalInsightsPayload["diagnosisHistory"]; warning: string | null }> {
  const { data, error } = await supabase
    .from("insight_professional_runs")
    .select("run_date,year,month,hit_rate_percent,cumulative_edge_value,risk_score,risk_regime,headline")
    .eq("year", year)
    .eq("month", month)
    .order("run_date", { ascending: false })
    .limit(21);

  if (error) {
    if (isMissingTableError(error.message, "insight_professional_runs")) {
      return {
        history: [],
        warning:
          "Tabela insight_professional_runs não existe. Histórico diário do diagnóstico está desabilitado.",
      };
    }
    return {
      history: [],
      warning: `Falha ao ler histórico diário do diagnóstico: ${error.message}`,
    };
  }

  const rows = (data ?? []) as ProfessionalRunRow[];
  return {
    history: rows.map((row) => ({
      runDate: String(row.run_date),
      year: Number(row.year),
      month: Number(row.month),
      hitRatePercent: row.hit_rate_percent === null ? null : toNum(row.hit_rate_percent),
      cumulativeEdgeValue: toNum(row.cumulative_edge_value),
      riskScore: toNum(row.risk_score),
      riskRegime: row.risk_regime,
      headline: String(row.headline ?? ""),
    })),
    warning: null,
  };
}

function buildDiagnosticAlerts(
  history: ProfessionalInsightsPayload["diagnosisHistory"],
): ProfessionalInsightsPayload["diagnosticAlerts"] {
  const alerts: ProfessionalInsightsPayload["diagnosticAlerts"] = [];
  if (history.length < 3) return alerts;

  const [d0, d1, d2] = history;

  if (
    d0.hitRatePercent !== null &&
    d1.hitRatePercent !== null &&
    d2.hitRatePercent !== null &&
    d0.hitRatePercent < d1.hitRatePercent &&
    d1.hitRatePercent < d2.hitRatePercent
  ) {
    const drop = d2.hitRatePercent - d0.hitRatePercent;
    alerts.push({
      id: "hit-rate-down-3d",
      severity: drop >= 15 ? "high" : "medium",
      title: "Hit rate em queda por 3 dias",
      message: `Taxa de acerto caiu ${drop.toFixed(1)} p.p. na sequência diária recente.`,
      trigger: `${d2.hitRatePercent.toFixed(1)}% → ${d1.hitRatePercent.toFixed(
        1,
      )}% → ${d0.hitRatePercent.toFixed(1)}%`,
    });
  }

  if (d0.riskScore > d1.riskScore && d1.riskScore > d2.riskScore) {
    const rise = d0.riskScore - d2.riskScore;
    alerts.push({
      id: "risk-up-3d",
      severity: d0.riskScore >= 60 ? "high" : "medium",
      title: "Risco em alta por 3 dias",
      message: `Score de risco subiu ${rise.toFixed(1)} pontos na série diária.`,
      trigger: `${d2.riskScore.toFixed(1)} → ${d1.riskScore.toFixed(1)} → ${d0.riskScore.toFixed(
        1,
      )}`,
    });
  }

  if (
    d0.cumulativeEdgeValue < d1.cumulativeEdgeValue &&
    d1.cumulativeEdgeValue < d2.cumulativeEdgeValue &&
    d0.cumulativeEdgeValue < 0
  ) {
    const deterioration = d2.cumulativeEdgeValue - d0.cumulativeEdgeValue;
    alerts.push({
      id: "edge-down-3d",
      severity: Math.abs(d0.cumulativeEdgeValue) >= 500 ? "high" : "medium",
      title: "Edge acumulado deteriorando",
      message: `Edge caiu ${formatCurrencyBRL(deterioration)} na janela diária e está negativo.`,
      trigger: `${formatCurrencyBRL(d2.cumulativeEdgeValue)} → ${formatCurrencyBRL(
        d1.cumulativeEdgeValue,
      )} → ${formatCurrencyBRL(d0.cumulativeEdgeValue)}`,
    });
  }

  if (alerts.length === 0 && history.length >= 2) {
    const latest = history[0];
    if (latest.hitRatePercent !== null && latest.hitRatePercent >= 60 && latest.riskScore <= 35) {
      alerts.push({
        id: "stability-green",
        severity: "low",
        title: "Motor estável no curto prazo",
        message: "Sem deterioração sequencial detectada nos principais sinais diários.",
        trigger: `Hit rate ${latest.hitRatePercent.toFixed(1)}% | risco ${latest.riskScore.toFixed(
          1,
        )}`,
      });
    }
  }

  return alerts.slice(0, 3);
}

function extractLatestBcbValue(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const row = payload[i] as BcbPoint;
    const parsed = toMaybeNum(
      typeof row?.valor === "string" ? row.valor.replace(",", ".") : row?.valor,
    );
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractYahooMonthlyCloses(
  payload: unknown,
): Array<{ year: number; month: number; close: number }> {
  const data = payload as YahooChartPayload;
  const point = data?.chart?.result?.[0];
  const timestamps = Array.isArray(point?.timestamp) ? point.timestamp : [];
  const closes = point?.indicators?.quote?.[0]?.close ?? [];
  const maxLength = Math.min(timestamps.length, closes.length);

  const map = new Map<string, { ts: number; close: number }>();
  for (let i = 0; i < maxLength; i += 1) {
    const ts = Number(timestamps[i]);
    const close = toMaybeNum(closes[i]);
    if (!Number.isFinite(ts) || close === null) continue;
    const dt = new Date(ts * 1000);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const key = monthKey(year, month);
    const previous = map.get(key);
    if (!previous || ts > previous.ts) {
      map.set(key, { ts, close });
    }
  }

  return Array.from(map.entries())
    .map(([key, value]) => {
      const [yearRaw, monthRaw] = key.split("-");
      return { year: Number(yearRaw), month: Number(monthRaw), close: value.close };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

function buildRiskRadar(series: Bucket[]): ProfessionalInsightsPayload["riskRadar"] {
  const momReturns: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pct = pctChange(series[i].total, series[i - 1].total);
    if (pct !== null) momReturns.push(pct);
  }
  const vol3 = stdDev(momReturns.slice(-3));
  const vol6 = stdDev(momReturns.slice(-6));

  const totalSeries = series.map((item) => item.total);
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of totalSeries) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      const dd = ((value - peak) / peak) * 100;
      maxDrawdown = Math.min(maxDrawdown, dd);
    }
  }

  const trendWindow = totalSeries.slice(-6);
  const slope = linearSlope(trendWindow);
  const meanBase = Math.max(1, mean(trendWindow));
  const trendPerMonthPercent = (slope / meanBase) * 100;

  const drawdownScore = Math.min(35, Math.abs(maxDrawdown) * 1.8);
  const volScore = Math.min(40, vol6 * 2);
  const trendPenalty = trendPerMonthPercent < 0 ? Math.min(25, Math.abs(trendPerMonthPercent) * 5) : 0;
  const score = Math.max(0, Math.min(100, drawdownScore + volScore + trendPenalty));
  const regime: ProfessionalInsightsPayload["riskRadar"]["regime"] =
    score < 30 ? "ESTAVEL" : score < 60 ? "ATENCAO" : "ESTRESSADO";

  return {
    regime,
    score,
    volatility3mPercent: vol3,
    volatility6mPercent: vol6,
    maxDrawdownPercent: maxDrawdown,
    trendPerMonthPercent,
  };
}

function buildRecommendation(
  series: Bucket[],
  investedByTheme: { cdb_itau: number; cdb_santander: number; fiis: number },
): ProfessionalInsightsPayload["recommendation"] {
  function buildBacktestDiagnosis(
    evaluations: ProfessionalInsightsPayload["recommendation"]["backtest"]["evaluations"],
    hitRatePercent: number | null,
    cumulativeEdgeValue: number,
    averageEdgeValue: number | null,
  ): ProfessionalInsightsPayload["recommendation"]["backtest"]["diagnosis"] {
    if (evaluations.length === 0) {
      return {
        headline: "Amostra insuficiente para diagnóstico robusto.",
        strengths: ["Necessário acumular histórico para validar consistência do motor."],
        weaknesses: ["Sem pontos suficientes para identificar padrão de erro."],
        nextAdjustment: "Manter coleta por mais competências antes de calibrar pesos.",
      };
    }

    const recent = evaluations.slice(0, Math.min(3, evaluations.length));
    const recentHits = recent.filter((item) => item.hit).length;
    const positiveEdges = evaluations.filter((item) => item.edgeValue >= 0).length;
    const edgeHitRate = (positiveEdges / evaluations.length) * 100;

    const missPairs = new Map<string, number>();
    for (const ev of evaluations) {
      if (ev.hit) continue;
      const key = `${ev.predictedLabel} -> ${ev.actualBestLabel}`;
      missPairs.set(key, (missPairs.get(key) ?? 0) + 1);
    }
    const mainMiss = Array.from(missPairs.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;

    const headline =
      hitRatePercent === null
        ? "Sem taxa de acerto calculável."
        : hitRatePercent >= 60
          ? "Motor com aderência boa ao regime atual."
          : hitRatePercent >= 45
            ? "Motor com aderência moderada; exige calibração leve."
            : "Motor com aderência baixa; precisa de ajuste tático.";

    const strengths: string[] = [];
    strengths.push(
      `Taxa de acerto em ${hitRatePercent === null ? "—" : `${hitRatePercent.toFixed(1)}%`} e edge positivo em ${edgeHitRate.toFixed(1)}% dos casos.`,
    );
    if (cumulativeEdgeValue >= 0) {
      strengths.push(
        `Edge acumulado favorável (${cumulativeEdgeValue >= 0 ? "+" : ""}${formatCurrencyBRL(
          Math.abs(cumulativeEdgeValue),
        )}).`,
      );
    } else {
      strengths.push(`Sinal ainda preserva alguns acertos direcionais no período recente.`);
    }
    if (recentHits >= 2) {
      strengths.push(`Recência positiva: ${recentHits}/${recent.length} acertos nas últimas competências.`);
    }

    const weaknesses: string[] = [];
    if (mainMiss) {
      weaknesses.push(`Falha recorrente: ${mainMiss[0]} (${mainMiss[1]} ocorrência(s)).`);
    } else {
      weaknesses.push("Não há padrão dominante de erro entre ativos.");
    }
    if (averageEdgeValue !== null && averageEdgeValue < 0) {
      weaknesses.push(
        `Edge médio negativo (${formatCurrencyBRL(averageEdgeValue)}), indicando seleção abaixo da média da cesta.`,
      );
    }
    if (recentHits <= 1 && recent.length >= 2) {
      weaknesses.push("Desempenho recente enfraqueceu, sugerindo mudança de regime de curto prazo.");
    }

    let nextAdjustment =
      "Ajustar peso de momentum para janela mais curta quando houver queda de acerto em 2 meses seguidos.";
    if (mainMiss && mainMiss[0].includes("FIIs")) {
      nextAdjustment =
        "Adicionar penalização macro para FIIs quando IFIX estiver em tendência negativa mensal.";
    } else if (mainMiss && mainMiss[0].includes("CDB Santander")) {
      nextAdjustment =
        "Revisar peso de estabilidade para evitar superconcentração no CDB Santander em meses de reversão.";
    }

    return {
      headline,
      strengths: strengths.slice(0, 3),
      weaknesses: weaknesses.slice(0, 3),
      nextAdjustment,
    };
  }

  function computeRecommendationItemsAtIndex(targetIndex: number) {
    const cutoff = Math.min(series.length - 1, Math.max(0, targetIndex));
    return ASSET_KEYS.map((key) => {
      const incomeSeries = series.slice(0, cutoff + 1).map((point) => point[key]);
      const current = incomeSeries[incomeSeries.length - 1] ?? 0;
      const previous = incomeSeries[incomeSeries.length - 2] ?? null;
      const momentum = pctChange(current, previous);
      const invested = investedByTheme[key];
      const monthlyYield = invested > 0 ? (current / invested) * 100 : null;

      const momSeries: number[] = [];
      for (let i = 1; i < incomeSeries.length; i += 1) {
        const pct = pctChange(incomeSeries[i], incomeSeries[i - 1]);
        if (pct !== null) momSeries.push(pct);
      }
      const vol = stdDev(momSeries.slice(-6));
      const stabilityPercent = Math.max(0, Math.min(100, 100 - vol * 8));

      const momentumScore = momentum === null ? 40 : Math.max(0, Math.min(100, 50 + momentum * 2));
      const yieldScore =
        monthlyYield === null ? 20 : Math.max(0, Math.min(100, (monthlyYield / 1.2) * 100));
      const totalScore = momentumScore * 0.4 + yieldScore * 0.35 + stabilityPercent * 0.25;

      const rationale = `Momentum ${
        momentum === null ? "indefinido" : `${momentum >= 0 ? "+" : ""}${momentum.toFixed(1)}%`
      }, yield mensal ${monthlyYield === null ? "n/d" : `${monthlyYield.toFixed(2)}%`} e estabilidade ${stabilityPercent.toFixed(0)}%.`;

      return {
        key,
        label: ASSET_LABELS[key],
        score: totalScore,
        momentumPercent: momentum,
        monthlyYieldPercent: monthlyYield,
        stabilityPercent,
        rationale,
      };
    }).sort((a, b) => b.score - a.score);
  }

  const items = computeRecommendationItemsAtIndex(series.length - 1);
  const best = items[0] ?? {
    key: "cdb_itau" as const,
    label: "CDB Itaú",
    score: 0,
    momentumPercent: null,
    monthlyYieldPercent: null,
    stabilityPercent: 0,
    rationale: "",
  };

  const evaluations: ProfessionalInsightsPayload["recommendation"]["backtest"]["evaluations"] = [];
  let hitCount = 0;
  let cumulativeEdgeValue = 0;

  for (let i = 2; i < series.length - 1; i += 1) {
    const predictionMonth = series[i];
    const nextMonth = series[i + 1];
    const predictedItems = computeRecommendationItemsAtIndex(i);
    const predictedBest = predictedItems[0];
    if (!predictedBest) continue;

    const actualSorted = ASSET_KEYS.map((key) => ({
      key,
      label: ASSET_LABELS[key],
      value: nextMonth[key],
    })).sort((a, b) => b.value - a.value);
    const actualBest = actualSorted[0];
    if (!actualBest) continue;

    const chosenValue = nextMonth[predictedBest.key];
    const averageValue = mean(actualSorted.map((item) => item.value));
    const edgeValue = chosenValue - averageValue;
    const hit = predictedBest.key === actualBest.key;

    if (hit) hitCount += 1;
    cumulativeEdgeValue += edgeValue;

    evaluations.push({
      fromMonthLabel: `${monthLabel(predictionMonth.month)}/${predictionMonth.year}`,
      toMonthLabel: `${monthLabel(nextMonth.month)}/${nextMonth.year}`,
      predictedKey: predictedBest.key,
      predictedLabel: predictedBest.label,
      actualBestKey: actualBest.key,
      actualBestLabel: actualBest.label,
      hit,
      chosenValue,
      bestValue: actualBest.value,
      edgeValue,
    });
  }

  const sampleSize = evaluations.length;
  const hitRatePercent = sampleSize > 0 ? (hitCount / sampleSize) * 100 : null;
  const averageEdgeValue = sampleSize > 0 ? cumulativeEdgeValue / sampleSize : null;
  const diagnosis = buildBacktestDiagnosis(
    evaluations.slice().reverse(),
    hitRatePercent,
    cumulativeEdgeValue,
    averageEdgeValue,
  );

  return {
    bestAssetKey: best.key,
    bestAssetLabel: best.label,
    action: `Próximo aporte tático: priorizar ${best.label} (score ${best.score.toFixed(1)}).`,
    items,
    backtest: {
      sampleSize,
      hitRatePercent,
      cumulativeEdgeValue,
      averageEdgeValue,
      evaluations: evaluations.slice(-12).reverse(),
      diagnosis,
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const warnings: string[] = [];
  const year = clampYear(
    searchParams.get("year") ? Number(searchParams.get("year")) : null,
    now.getFullYear(),
  );
  const month = clampMonth(
    searchParams.get("month") ? Number(searchParams.get("month")) : null,
    now.getMonth() + 1,
  );

  const [
    investmentsRes,
    returnsRes,
    monthlyGoalsRes,
    annualGoalsRes,
    cashEventsRes,
    cdiPayload,
    ibovPayload,
    ifixPayload,
  ] = await Promise.all([
    supabase.from("investments").select("id,type,institution,amount_invested"),
    supabase
      .from("monthly_returns")
      .select("investment_id,year,month,income_value,created_at")
      .gte("year", year - 2)
      .lte("year", year)
      .order("year", { ascending: true })
      .order("month", { ascending: true }),
    supabase
      .from("investment_goals_monthly")
      .select("investment_id,monthly_target")
      .eq("year", year)
      .eq("month", month),
    supabase
      .from("investment_goals_annual")
      .select("investment_id,annual_target")
      .eq("year", year),
    supabase
      .from("investment_cash_events")
      .select("month,type,amount")
      .eq("year", year)
      .lte("month", month),
    fetchJson(BCB_CDI_DAILY_URL),
    fetchJson(YAHOO_IBOV_MONTHLY_URL),
    fetchJson(YAHOO_IFIX_MONTHLY_URL),
  ]);

  if (investmentsRes.error || returnsRes.error) {
    return NextResponse.json(
      {
        error: investmentsRes.error?.message ?? returnsRes.error?.message ?? "Erro ao montar insights profissionais.",
      },
      { status: 500 },
    );
  }
  if (monthlyGoalsRes.error) {
    if (isMissingTableError(monthlyGoalsRes.error.message, "investment_goals_monthly")) {
      warnings.push("Tabela investment_goals_monthly não existe. Probabilidade de meta mensal parcial.");
    } else {
      warnings.push(`Falha ao ler metas mensais: ${monthlyGoalsRes.error.message}`);
    }
  }
  if (annualGoalsRes.error) {
    if (isMissingTableError(annualGoalsRes.error.message, "investment_goals_annual")) {
      warnings.push("Tabela investment_goals_annual não existe. Probabilidade de meta anual parcial.");
    } else {
      warnings.push(`Falha ao ler metas anuais: ${annualGoalsRes.error.message}`);
    }
  }
  if (cashEventsRes.error) {
    if (isMissingTableError(cashEventsRes.error.message, "investment_cash_events")) {
      warnings.push("Tabela investment_cash_events não existe. Projeção anual usa fluxo neutro.");
    } else {
      warnings.push(`Falha ao ler eventos de caixa: ${cashEventsRes.error.message}`);
    }
  }

  const investments = (investmentsRes.data ?? []) as InvestmentRow[];
  const returns = (returnsRes.data ?? []) as ReturnRow[];
  const series = buildBucketSeries(investments, returns);
  const currentYearSeries = series.filter((item) => item.year === year && item.month <= month);

  const currentBucket =
    findBucket(series, year, month) ??
    currentYearSeries[currentYearSeries.length - 1] ?? {
      year,
      month,
      cdb_itau: 0,
      cdb_santander: 0,
      fiis: 0,
      total: 0,
      latestEntryAt: null,
    };
  const prevRef = previousMonthOf(currentBucket.year, currentBucket.month);
  const previousBucket = findBucket(series, prevRef.year, prevRef.month);

  const forecastMetrics = [
    buildForecastMetric(series, "cdb_itau", year, month, "CDB Itaú"),
    buildForecastMetric(series, "cdb_santander", year, month, "CDB Santander"),
    buildForecastMetric(series, "fiis", year, month, "Dividendos FIIs"),
    buildForecastMetric(series, "total", year, month, "Total"),
  ];

  const invById = new Map<string, InvestmentRow>(investments.map((inv) => [inv.id, inv]));
  const monthlyTarget = (monthlyGoalsRes.data ?? []).reduce((acc, row) => {
    const cast = row as { investment_id: string; monthly_target: number };
    const investment = invById.get(cast.investment_id);
    if (!investment || investment.type !== "CDB") return acc;
    return acc + toNum(cast.monthly_target);
  }, 0);
  const annualTarget = (annualGoalsRes.data ?? []).reduce((acc, row) => {
    const cast = row as { investment_id: string; annual_target: number };
    const investment = invById.get(cast.investment_id);
    if (!investment || investment.type !== "CDB") return acc;
    return acc + toNum(cast.annual_target);
  }, 0);

  const currentCdbIncome = currentBucket.cdb_itau + currentBucket.cdb_santander;
  const cdbHistory = series.map((item) => item.cdb_itau + item.cdb_santander).slice(-12);
  const cdbSigmaBase = stdDev(cdbHistory);
  const isCurrentContext = year === now.getFullYear() && month === now.getMonth() + 1;
  const elapsedBusinessDays = isCurrentContext
    ? Math.max(1, countBusinessDaysElapsedInMonth(year, month, now.getDate()))
    : null;
  const totalBusinessDays = isCurrentContext ? Math.max(1, countBusinessDaysInMonth(year, month)) : null;
  const monthlyProjection =
    isCurrentContext && elapsedBusinessDays && totalBusinessDays
      ? currentCdbIncome * (totalBusinessDays / elapsedBusinessDays)
      : currentCdbIncome;
  const monthlyRemainingRatio =
    isCurrentContext && elapsedBusinessDays && totalBusinessDays
      ? Math.max(0, (totalBusinessDays - elapsedBusinessDays) / totalBusinessDays)
      : 0;
  const monthlySigma = Math.max(1, cdbSigmaBase * Math.max(0.25, Math.sqrt(monthlyRemainingRatio)));
  const monthlyProb = probabilityToReachTarget(
    monthlyTarget > 0 ? monthlyTarget : null,
    monthlyProjection,
    monthlySigma,
  );

  const cdbInvestedCapital = investments.reduce((acc, inv) => {
    if (inv.type !== "CDB") return acc;
    return acc + toNum(inv.amount_invested);
  }, 0);
  const investedByTheme = investments.reduce(
    (acc, inv) => {
      const amount = toNum(inv.amount_invested);
      if (inv.type === "FII") {
        acc.fiis += amount;
      } else if (isItauInstitution(inv.institution)) {
        acc.cdb_itau += amount;
      } else {
        acc.cdb_santander += amount;
      }
      return acc;
    },
    { cdb_itau: 0, cdb_santander: 0, fiis: 0 },
  );

  const netCashByMonth = new Map<number, number>();
  for (const row of (cashEventsRes.data ?? []) as Array<{ month: number; type: string; amount: number }>) {
    const current = netCashByMonth.get(toNum(row.month)) ?? 0;
    const type = String(row.type ?? "").toUpperCase();
    const delta =
      type === "APORTE"
        ? toNum(row.amount)
        : type === "RESGATE"
          ? -toNum(row.amount)
          : 0;
    netCashByMonth.set(toNum(row.month), current + delta);
  }

  const monthlyNetFlowSeries = monthSequence(1, month).map((m) => netCashByMonth.get(m) ?? 0);
  const avgNetFlow = mean(monthlyNetFlowSeries);
  const sigmaNetFlow = stdDev(monthlyNetFlowSeries);
  const monthsRemaining = Math.max(0, 12 - month);
  const projectedAnnualCapital = cdbInvestedCapital + avgNetFlow * monthsRemaining;
  const annualSigma = Math.max(1, sigmaNetFlow * Math.sqrt(Math.max(1, monthsRemaining)));
  const annualProb = probabilityToReachTarget(
    annualTarget > 0 ? annualTarget : null,
    projectedAnnualCapital,
    annualSigma,
  );

  const totalCurrent = currentBucket.total;
  const totalPrevious = previousBucket?.total ?? 0;
  const totalDelta = totalCurrent - totalPrevious;
  const attributionItems: ProfessionalInsightsPayload["attribution"]["items"] = [
    {
      key: "cdb_itau",
      label: "CDB Itaú",
      currentValue: currentBucket.cdb_itau,
      previousValue: previousBucket?.cdb_itau ?? 0,
      deltaValue: currentBucket.cdb_itau - (previousBucket?.cdb_itau ?? 0),
      shareCurrentPercent: totalCurrent > 0 ? (currentBucket.cdb_itau / totalCurrent) * 100 : 0,
      contributionToDeltaPercent:
        Math.abs(totalDelta) < 0.01 ? null : ((currentBucket.cdb_itau - (previousBucket?.cdb_itau ?? 0)) / totalDelta) * 100,
    },
    {
      key: "cdb_santander",
      label: "CDB Santander",
      currentValue: currentBucket.cdb_santander,
      previousValue: previousBucket?.cdb_santander ?? 0,
      deltaValue: currentBucket.cdb_santander - (previousBucket?.cdb_santander ?? 0),
      shareCurrentPercent: totalCurrent > 0 ? (currentBucket.cdb_santander / totalCurrent) * 100 : 0,
      contributionToDeltaPercent:
        Math.abs(totalDelta) < 0.01
          ? null
          : ((currentBucket.cdb_santander - (previousBucket?.cdb_santander ?? 0)) / totalDelta) * 100,
    },
    {
      key: "fiis",
      label: "Dividendos FIIs",
      currentValue: currentBucket.fiis,
      previousValue: previousBucket?.fiis ?? 0,
      deltaValue: currentBucket.fiis - (previousBucket?.fiis ?? 0),
      shareCurrentPercent: totalCurrent > 0 ? (currentBucket.fiis / totalCurrent) * 100 : 0,
      contributionToDeltaPercent:
        Math.abs(totalDelta) < 0.01 ? null : ((currentBucket.fiis - (previousBucket?.fiis ?? 0)) / totalDelta) * 100,
    },
  ];

  const monthsWithDataSet = new Set(currentYearSeries.map((item) => item.month));
  const expectedMonths = month;
  const missingMonths = monthSequence(1, month).filter((m) => !monthsWithDataSet.has(m));
  const monthsWithData = Math.max(0, expectedMonths - missingMonths.length);
  const completenessPercent = expectedMonths > 0 ? (monthsWithData / expectedMonths) * 100 : 0;

  const duplicateKeyCount = new Map<string, number>();
  for (const row of returns) {
    if (row.year !== year || row.month > month) continue;
    const key = `${row.investment_id}-${row.year}-${row.month}`;
    duplicateKeyCount.set(key, (duplicateKeyCount.get(key) ?? 0) + 1);
  }
  const duplicateRows = Array.from(duplicateKeyCount.values()).filter((value) => value > 1).length;

  const latestTotals = series.slice(-24).map((item) => item.total);
  const totalMean = mean(latestTotals);
  const totalStd = stdDev(latestTotals);
  const outlierCount =
    totalStd <= 0
      ? 0
      : series
          .slice(-24)
          .filter((item) => Math.abs((item.total - totalMean) / totalStd) >= 2.5).length;

  const latestEntryAt = pickLatestTimestamp(currentYearSeries);
  const stalenessDays =
    latestEntryAt === null
      ? null
      : Math.floor((Date.now() - new Date(latestEntryAt).getTime()) / (1000 * 60 * 60 * 24));

  const qualityWarnings: string[] = [];
  if (missingMonths.length > 0) {
    qualityWarnings.push(`Há ${missingMonths.length} mês(es) sem lançamentos no ano selecionado.`);
  }
  if (outlierCount > 0) {
    qualityWarnings.push(`${outlierCount} ponto(s) fora do padrão estatístico recente.`);
  }
  if (duplicateRows > 0) {
    qualityWarnings.push(`${duplicateRows} competência(s) com possível duplicidade de lançamento.`);
  }
  if (stalenessDays !== null && stalenessDays > 31) {
    qualityWarnings.push(`Dados sem atualização recente (${stalenessDays} dias).`);
  }

  const dataGrade: "A" | "B" | "C" =
    completenessPercent >= 95 && duplicateRows === 0 && outlierCount === 0
      ? "A"
      : completenessPercent >= 80 && duplicateRows === 0
        ? "B"
        : "C";

  const benchmarkWarnings: string[] = [];
  const cdiDaily = extractLatestBcbValue(cdiPayload);
  let cdiMom: number | null = null;
  if (cdiDaily !== null) {
    cdiMom = monthlyEquivalentFromAnnualRate(annualizeDailyRate(cdiDaily));
  } else {
    benchmarkWarnings.push("CDI indisponível para benchmark.");
  }

  const ibovSeries = extractYahooMonthlyCloses(ibovPayload);
  const ifixSeries = extractYahooMonthlyCloses(ifixPayload);
  const prevMonthRef = previousMonthOf(year, month);

  const ibovCurrent = ibovSeries.find((item) => item.year === year && item.month === month) ?? null;
  const ibovPrev =
    ibovSeries.find((item) => item.year === prevMonthRef.year && item.month === prevMonthRef.month) ??
    null;
  const ifixCurrent = ifixSeries.find((item) => item.year === year && item.month === month) ?? null;
  const ifixPrev =
    ifixSeries.find((item) => item.year === prevMonthRef.year && item.month === prevMonthRef.month) ??
    null;

  const ibovMom = pctChange(ibovCurrent?.close ?? null, ibovPrev?.close ?? null);
  const ifixMom = pctChange(ifixCurrent?.close ?? null, ifixPrev?.close ?? null);
  if (ibovMom === null) benchmarkWarnings.push("Ibovespa mensal indisponível para competência selecionada.");
  if (ifixMom === null) benchmarkWarnings.push("IFIX mensal indisponível para competência selecionada.");

  const portfolioMom = pctChange(totalCurrent, totalPrevious);
  const riskRadar = buildRiskRadar(currentYearSeries.length > 0 ? currentYearSeries : series);
  const recommendation = buildRecommendation(
    currentYearSeries.length > 0 ? currentYearSeries : series,
    investedByTheme,
  );
  const runDate = getSaoPauloDateISO();

  const persistPayload = {
    run_date: runDate,
    year,
    month,
    hit_rate_percent: recommendation.backtest.hitRatePercent,
    cumulative_edge_value: recommendation.backtest.cumulativeEdgeValue,
    risk_score: riskRadar.score,
    risk_regime: riskRadar.regime,
    headline: recommendation.backtest.diagnosis.headline,
    report: {
      recommendation: {
        action: recommendation.action,
        bestAssetKey: recommendation.bestAssetKey,
        bestAssetLabel: recommendation.bestAssetLabel,
        backtest: recommendation.backtest,
      },
      riskRadar,
      benchmark: {
        portfolioMomPercent: portfolioMom,
        cdiMomPercent: cdiMom,
        ifixMomPercent: ifixMom,
        ibovMomPercent: ibovMom,
      },
    },
    updated_at: new Date().toISOString(),
  };

  const { error: persistError } = await supabase
    .from("insight_professional_runs")
    .upsert(persistPayload, { onConflict: "run_date,year,month" });

  if (persistError) {
    if (isMissingTableError(persistError.message, "insight_professional_runs")) {
      warnings.push(
        "Tabela insight_professional_runs não existe. Evolução diária do diagnóstico está desabilitada.",
      );
    } else {
      warnings.push(`Falha ao persistir diagnóstico diário: ${persistError.message}`);
    }
  }

  const historyResult = await fetchDiagnosisHistory(year, month);
  if (historyResult.warning) warnings.push(historyResult.warning);
  const diagnosticAlerts = buildDiagnosticAlerts(historyResult.history);

  const payload: ProfessionalInsightsPayload = {
    year,
    month,
    generatedAt: new Date().toISOString(),
    warnings,
    forecastQuality: {
      metrics: forecastMetrics,
    },
    goalProbabilities: {
      monthlyIncome: {
        label: "Meta mensal de rendimento (CDBs)",
        targetValue: monthlyTarget > 0 ? monthlyTarget : null,
        realizedValue: currentCdbIncome,
        projectedValue: monthlyProjection,
        probabilityPercent: monthlyProb,
        confidenceBand:
          monthlyTarget > 0 ? safeBand(monthlyProjection, monthlySigma) : null,
      },
      annualCapital: {
        label: "Meta anual de patrimônio (CDBs)",
        targetValue: annualTarget > 0 ? annualTarget : null,
        realizedValue: cdbInvestedCapital,
        projectedValue: projectedAnnualCapital,
        probabilityPercent: annualProb,
        confidenceBand:
          annualTarget > 0 ? safeBand(projectedAnnualCapital, annualSigma) : null,
      },
    },
    attribution: {
      monthLabel: `${monthLabel(currentBucket.month)}/${currentBucket.year}`,
      previousMonthLabel: previousBucket
        ? `${monthLabel(previousBucket.month)}/${previousBucket.year}`
        : null,
      totalCurrent,
      totalPrevious,
      totalDelta,
      items: attributionItems,
    },
    benchmark: {
      referenceMonthLabel: `${monthLabel(month)}/${year}`,
      portfolioMomPercent: portfolioMom,
      cdiMomPercent: cdiMom,
      ifixMomPercent: ifixMom,
      ibovMomPercent: ibovMom,
      excessVsCdiPercent:
        portfolioMom !== null && cdiMom !== null ? portfolioMom - cdiMom : null,
      excessVsIfixPercent:
        portfolioMom !== null && ifixMom !== null ? portfolioMom - ifixMom : null,
      excessVsIbovPercent:
        portfolioMom !== null && ibovMom !== null ? portfolioMom - ibovMom : null,
      warnings: benchmarkWarnings,
    },
    riskRadar,
    recommendation,
    diagnosisHistory: historyResult.history,
    diagnosticAlerts,
    dataQuality: {
      grade: dataGrade,
      completenessPercent,
      expectedMonths,
      monthsWithData,
      missingMonths,
      duplicateRows,
      outlierCount,
      stalenessDays,
      latestEntryAt,
      warnings: qualityWarnings,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
