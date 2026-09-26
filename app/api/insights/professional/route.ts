import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { formatCurrencyBRL, monthLabel } from "../../../../lib/formatters";
import { countBusinessDaysInMonth } from "../../../../lib/business-days";
import {
  INSIGHTS_ENGINE_VERSION,
  PaceInvestmentRow,
  PaceRevisionRow,
  buildMonthPace,
  parseIsoDate,
} from "../../../../lib/month-pace";
import { MonthPace, ProfessionalInsightsPayload } from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BCB_CDI_DAILY_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json";
const YAHOO_IBOV_MONTHLY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=2y&interval=1mo";
const YAHOO_IFIX_MONTHLY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/IFIX.SA?range=2y&interval=1mo";
const EXTERNAL_FETCH_TIMEOUT_MS = 5000;

type InvestmentRow = PaceInvestmentRow & { cdi_rate: number | string | null };

type ReturnRow = {
  investment_id: string;
  year: number;
  month: number;
  income_value: number;
  created_at?: string | null;
};

type CashEventRow = {
  investment_id: string | null;
  year: number;
  month: number;
  type: string;
  amount: number;
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

// Um ponto por competência; no mês em andamento os valores são a projeção de fechamento.
type MonthPoint = {
  year: number;
  month: number;
  businessDays: number;
  values: Map<string, number>;
  total: number;
  inProgress: boolean;
};

function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toMaybeNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function safeBand(base: number, sigma: number): { pessimistic: number; base: number; optimistic: number } {
  const delta = Math.abs(sigma);
  return {
    pessimistic: Math.max(0, base - delta),
    base: Math.max(0, base),
    optimistic: Math.max(0, base + delta),
  };
}

function resolvePlannedAporte(): number {
  const planned = Number(process.env.FINANCEFLOW_DAILY_PLANNED_APORTE ?? 1000);
  return Number.isFinite(planned) && planned > 0 ? planned : 1000;
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
    .eq("report->>engineVersion", INSIGHTS_ENGINE_VERSION)
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
      severity: Math.abs(d0.cumulativeEdgeValue) >= 5 ? "high" : "medium",
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

function buildMonthSeries(returns: ReturnRow[], pace: MonthPace): MonthPoint[] {
  const byMonth = new Map<string, MonthPoint>();
  const ensurePoint = (year: number, month: number): MonthPoint => {
    const key = monthKey(year, month);
    let point = byMonth.get(key);
    if (!point) {
      point = {
        year,
        month,
        businessDays: Math.max(1, countBusinessDaysInMonth(year, month)),
        values: new Map<string, number>(),
        total: 0,
        inProgress: false,
      };
      byMonth.set(key, point);
    }
    return point;
  };

  for (const row of returns) {
    if (row.year > pace.year || (row.year === pace.year && row.month > pace.month)) continue;
    const point = ensurePoint(row.year, row.month);
    point.values.set(row.investment_id, (point.values.get(row.investment_id) ?? 0) + toNum(row.income_value));
  }

  if (pace.isCurrentMonth) {
    const current = ensurePoint(pace.year, pace.month);
    current.inProgress = true;
    for (const item of pace.investments) {
      current.values.set(item.investmentId, item.projected);
    }
  }

  for (const point of Array.from(byMonth.values())) {
    point.total = Array.from(point.values.values()).reduce((acc, value) => acc + value, 0);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.year - b.year || a.month - b.month);
}

function valueOf(point: MonthPoint, key: string): number {
  return key === "total" ? point.total : point.values.get(key) ?? 0;
}

// Erro da previsão ingênua (média por dia útil dos 3 meses anteriores), só com meses fechados.
function buildForecastMetric(series: MonthPoint[], key: string, year: number, label: string) {
  const closed = series.filter((point) => !point.inProgress);
  const errors: number[] = [];
  const absErrors: number[] = [];
  const absPctErrors: number[] = [];
  let directionHits = 0;
  let sampleSize = 0;

  for (let i = 3; i < closed.length; i += 1) {
    const point = closed[i];
    if (point.year !== year) continue;
    const history = [closed[i - 1], closed[i - 2], closed[i - 3]];
    const actual = valueOf(point, key);
    // Sem posição no período avaliado (ativo novo ou encerrado) não entra na amostra.
    if (actual <= 0 || history.some((item) => valueOf(item, key) <= 0)) continue;

    const forecast = mean(history.map((item) => valueOf(item, key) / item.businessDays)) * point.businessDays;
    const prevActual = valueOf(closed[i - 1], key);
    const error = actual - forecast;

    errors.push(error);
    absErrors.push(Math.abs(error));
    absPctErrors.push(Math.abs(error) / actual);
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

// Renda por dia útil elimina o efeito de meses com mais ou menos dias úteis.
function buildRiskRadar(series: MonthPoint[]): ProfessionalInsightsPayload["riskRadar"] {
  const window = series.slice(-12);
  const perDay = window.map((point) => point.total / point.businessDays);
  const momReturns: number[] = [];
  for (let i = 1; i < perDay.length; i += 1) {
    const pct = pctChange(perDay[i], perDay[i - 1]);
    if (pct !== null) momReturns.push(pct);
  }
  const vol3 = stdDev(momReturns.slice(-3));
  const vol6 = stdDev(momReturns.slice(-6));

  let peak = 0;
  let maxDrawdown = 0;
  for (const value of perDay) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, ((value - peak) / peak) * 100);
    }
  }

  const trendWindow = perDay.slice(-6);
  const slope = linearSlope(trendWindow);
  const meanBase = Math.max(0.000001, mean(trendWindow));
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

// Capital aproximado em cada competência: saldo aplicado atual menos o fluxo líquido posterior.
function buildCapitalResolver(investments: InvestmentRow[], cashEvents: CashEventRow[]) {
  const investedNow = new Map(investments.map((inv) => [inv.id, toNum(inv.amount_invested)]));
  return (investmentId: string, year: number, month: number): number => {
    let capital = investedNow.get(investmentId) ?? 0;
    for (const event of cashEvents) {
      if (event.investment_id !== investmentId) continue;
      const isAfter = event.year > year || (event.year === year && event.month > month);
      if (!isAfter) continue;
      const type = String(event.type ?? "").toUpperCase();
      if (type === "APORTE") capital -= toNum(event.amount);
      if (type === "RESGATE") capital += toNum(event.amount);
    }
    return capital;
  };
}

function buildRecommendation(
  series: MonthPoint[],
  pace: MonthPace,
  labels: Map<string, string>,
  capitalAt: (investmentId: string, year: number, month: number) => number,
  cdiMonthPercent: number | null,
): ProfessionalInsightsPayload["recommendation"] {
  const plannedAporte = resolvePlannedAporte();
  // O mês de estreia de cada investimento é parcial (aplicação no meio do mês) e distorce o rendimento.
  const firstIncomeKey = new Map<string, string>();
  for (const point of series) {
    for (const [investmentId, value] of Array.from(point.values.entries())) {
      if (value > 0 && !firstIncomeKey.has(investmentId)) {
        firstIncomeKey.set(investmentId, monthKey(point.year, point.month));
      }
    }
  }
  const yieldAt = (investmentId: string, point: MonthPoint): number | null => {
    if (firstIncomeKey.get(investmentId) === monthKey(point.year, point.month)) return null;
    const capital = capitalAt(investmentId, point.year, point.month);
    const value = point.values.get(investmentId) ?? 0;
    if (capital <= 0 || value <= 0) return null;
    return (value / capital) * 100;
  };

  const current = series[series.length - 1] ?? null;
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const items: ProfessionalInsightsPayload["recommendation"]["items"] = pace.investments
    .filter((item) => item.invested > 0)
    .map((item) => {
      const monthlyYield = current ? yieldAt(item.investmentId, current) : null;
      const previousYield = previous ? yieldAt(item.investmentId, previous) : null;
      const momentum = pctChange(monthlyYield, previousYield);
      const yieldHistory = series
        .slice(-6)
        .map((point) => yieldAt(item.investmentId, point))
        .filter((value): value is number => value !== null);
      const yieldMean = mean(yieldHistory);
      const cv = yieldMean > 0 ? stdDev(yieldHistory) / yieldMean : 0;
      const stabilityPercent = clamp(100 - cv * 400, 0, 100);
      const percentOfCdi =
        monthlyYield !== null && cdiMonthPercent !== null && cdiMonthPercent > 0
          ? (monthlyYield / cdiMonthPercent) * 100
          : null;

      const yieldScore =
        percentOfCdi !== null
          ? clamp(((percentOfCdi - 80) / 50) * 100, 0, 100)
          : monthlyYield !== null
            ? clamp((monthlyYield / 1.2) * 100, 0, 100)
            : 0;
      const momentumScore = momentum === null ? 50 : clamp(50 + momentum * 5, 0, 100);
      const score = yieldScore * 0.6 + stabilityPercent * 0.25 + momentumScore * 0.15;

      const rationale = `Rendimento ${
        monthlyYield === null ? "n/d" : `${monthlyYield.toFixed(2)}%`
      } no mês${percentOfCdi === null ? "" : ` (${percentOfCdi.toFixed(0)}% do CDI)`}, variação ${
        momentum === null ? "indefinida" : `${momentum >= 0 ? "+" : ""}${momentum.toFixed(1)}%`
      } vs mês anterior e estabilidade ${stabilityPercent.toFixed(0)}%.`;

      return {
        key: item.investmentId,
        label: item.label,
        score,
        momentumPercent: momentum,
        monthlyYieldPercent: monthlyYield,
        stabilityPercent,
        rationale,
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = items[0] ?? null;

  // Backtest: o sinal do mês M escolhe o maior rendimento sobre o capital; o resultado é medido em M+1.
  const closed = series.filter((point) => !point.inProgress).slice(-13);
  const evaluations: ProfessionalInsightsPayload["recommendation"]["backtest"]["evaluations"] = [];
  let hitCount = 0;
  let cumulativeEdgeValue = 0;
  for (let i = 0; i < closed.length - 1; i += 1) {
    const signalMonth = closed[i];
    const resultMonth = closed[i + 1];
    const candidates = Array.from(labels.keys())
      .map((key) => ({ key, signal: yieldAt(key, signalMonth), result: yieldAt(key, resultMonth) }))
      .filter(
        (item): item is { key: string; signal: number; result: number } =>
          item.signal !== null && item.result !== null,
      );
    if (candidates.length < 2) continue;

    const predicted = candidates.slice().sort((a, b) => b.signal - a.signal)[0];
    const actualBest = candidates.slice().sort((a, b) => b.result - a.result)[0];
    const averageResult = mean(candidates.map((item) => item.result));
    const chosenValue = (predicted.result / 100) * plannedAporte;
    const bestValue = (actualBest.result / 100) * plannedAporte;
    const edgeValue = ((predicted.result - averageResult) / 100) * plannedAporte;
    const hit = predicted.key === actualBest.key;
    if (hit) hitCount += 1;
    cumulativeEdgeValue += edgeValue;

    evaluations.push({
      fromMonthLabel: `${monthLabel(signalMonth.month)}/${signalMonth.year}`,
      toMonthLabel: `${monthLabel(resultMonth.month)}/${resultMonth.year}`,
      predictedKey: predicted.key,
      predictedLabel: labels.get(predicted.key) ?? predicted.key,
      actualBestKey: actualBest.key,
      actualBestLabel: labels.get(actualBest.key) ?? actualBest.key,
      hit,
      chosenValue,
      bestValue,
      edgeValue,
    });
  }

  const sampleSize = evaluations.length;
  const hitRatePercent = sampleSize > 0 ? (hitCount / sampleSize) * 100 : null;
  const averageEdgeValue = sampleSize > 0 ? cumulativeEdgeValue / sampleSize : null;

  return {
    bestAssetKey: best?.key ?? "",
    bestAssetLabel: best?.label ?? "—",
    action: best
      ? `Próximo aporte tático: priorizar ${best.label} (score ${best.score.toFixed(1)}).`
      : "Sem investimentos ativos para recomendar aporte.",
    items,
    backtest: {
      sampleSize,
      hitRatePercent,
      cumulativeEdgeValue,
      averageEdgeValue,
      evaluations: evaluations.slice().reverse().slice(0, 12),
      diagnosis: buildBacktestDiagnosis(
        evaluations.slice().reverse(),
        hitRatePercent,
        cumulativeEdgeValue,
        averageEdgeValue,
        plannedAporte,
      ),
    },
  };
}

function buildBacktestDiagnosis(
  evaluations: ProfessionalInsightsPayload["recommendation"]["backtest"]["evaluations"],
  hitRatePercent: number | null,
  cumulativeEdgeValue: number,
  averageEdgeValue: number | null,
  plannedAporte: number,
): ProfessionalInsightsPayload["recommendation"]["backtest"]["diagnosis"] {
  if (evaluations.length === 0) {
    return {
      headline: "Amostra insuficiente para diagnóstico robusto.",
      strengths: ["Necessário acumular histórico com ao menos dois investimentos ativos."],
      weaknesses: ["Sem pontos suficientes para identificar padrão de erro."],
      nextAdjustment: "Manter lançamentos e aportes registrados para calibrar o motor.",
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

  const strengths: string[] = [
    `Taxa de acerto em ${hitRatePercent === null ? "—" : `${hitRatePercent.toFixed(1)}%`} e ganho acima da média em ${edgeHitRate.toFixed(1)}% dos meses.`,
  ];
  if (cumulativeEdgeValue >= 0) {
    strengths.push(
      `Seguir o sinal rendeu ${formatCurrencyBRL(cumulativeEdgeValue)} a mais que a média, somando os meses, por aporte de ${formatCurrencyBRL(plannedAporte)}.`,
    );
  }
  if (recentHits >= 2) {
    strengths.push(`Recência positiva: ${recentHits}/${recent.length} acertos nas últimas competências.`);
  }

  const weaknesses: string[] = [];
  if (mainMiss) {
    weaknesses.push(`Falha recorrente: ${mainMiss[0]} (${mainMiss[1]} ocorrência(s)).`);
  } else {
    weaknesses.push("Não há padrão dominante de erro entre investimentos.");
  }
  if (averageEdgeValue !== null && averageEdgeValue < 0) {
    weaknesses.push(
      `Ganho médio abaixo da média da carteira (${formatCurrencyBRL(averageEdgeValue)} por mês por aporte).`,
    );
  }
  if (recentHits <= 1 && recent.length >= 2) {
    weaknesses.push("Desempenho recente enfraqueceu, sugerindo mudança de taxas entre os investimentos.");
  }

  return {
    headline,
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    nextAdjustment: mainMiss
      ? `Conferir taxa contratada (% do CDI) e aportes registrados de ${mainMiss[0].split(" -> ")[1]}, que superou o sinal.`
      : "Manter o sinal por rendimento sobre o capital e revisar a cada fechamento.",
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
  const runDate = getSaoPauloDateISO();

  const [
    investmentsRes,
    returnsRes,
    revisionsRes,
    monthlyGoalsRes,
    annualGoalsRes,
    cashEventsRes,
    cdiPayload,
    ibovPayload,
    ifixPayload,
  ] = await Promise.all([
    supabase.from("investments").select("id,type,institution,name,amount_invested,cdi_rate"),
    supabase
      .from("monthly_returns")
      .select("investment_id,year,month,income_value,created_at")
      .gte("year", year - 2)
      .lte("year", year)
      .order("year", { ascending: true })
      .order("month", { ascending: true }),
    supabase
      .from("monthly_return_revisions")
      .select("investment_id,new_income_value,created_at")
      .eq("year", year)
      .eq("month", month),
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
      .select("investment_id,year,month,type,amount")
      .gte("year", year - 2)
      .lte("year", year),
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
  if (revisionsRes.error) {
    warnings.push(
      isMissingTableError(revisionsRes.error.message, "monthly_return_revisions")
        ? "Tabela monthly_return_revisions não existe. Ritmo diário estimado pela média do mês."
        : `Falha ao ler revisões: ${revisionsRes.error.message}`,
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
  const revisions = (revisionsRes.data ?? []) as PaceRevisionRow[];
  const cashEvents = (cashEventsRes.data ?? []) as CashEventRow[];
  const invById = new Map<string, InvestmentRow>(investments.map((inv) => [inv.id, inv]));
  const labels = new Map<string, string>(
    investments.map((inv) => [inv.id, inv.name || `${inv.type} ${inv.institution}`]),
  );

  const pace = buildMonthPace({
    year,
    month,
    today: parseIsoDate(runDate),
    investments,
    returns,
    revisions,
  });
  const series = buildMonthSeries(returns, pace);
  const currentPoint = series.find((point) => point.year === year && point.month === month) ?? null;
  const previousPoint = series.filter((point) => point.year < year || (point.year === year && point.month < month)).pop() ?? null;

  // Qualidade da previsão: uma linha por investimento ativo, mais o total.
  const forecastMetrics = [
    ...pace.investments.map((item) => buildForecastMetric(series, item.investmentId, year, item.label)),
    buildForecastMetric(series, "total", year, "Total"),
  ];

  // Meta mensal de rendimento dos CDBs ativos.
  const activeCdbs = pace.investments.filter((item) => item.type === "CDB");
  const activeCdbIds = new Set(activeCdbs.map((item) => item.investmentId));
  const monthlyTarget = (monthlyGoalsRes.data ?? []).reduce((acc, row) => {
    const cast = row as { investment_id: string; monthly_target: number };
    return activeCdbIds.has(cast.investment_id) ? acc + toNum(cast.monthly_target) : acc;
  }, 0);
  const monthlyRealized = activeCdbs.reduce((acc, item) => acc + item.realized, 0);
  const monthlyProjection = activeCdbs.reduce((acc, item) => acc + item.projected, 0);
  const remainingAccrual = activeCdbs.reduce(
    (acc, item) => acc + item.dailyRate * item.remainingBusinessDays,
    0,
  );
  // Incerteza: ±10% no ganho dos dias restantes + 0,5% de erro de lançamento.
  const monthlySigma = pace.isCurrentMonth ? Math.max(1, remainingAccrual * 0.1 + monthlyRealized * 0.005) : 0;
  const monthlyProb = probabilityToReachTarget(
    monthlyTarget > 0 ? monthlyTarget : null,
    monthlyProjection,
    monthlySigma,
  );

  // Meta anual de patrimônio dos CDBs.
  const annualTarget = (annualGoalsRes.data ?? []).reduce((acc, row) => {
    const cast = row as { investment_id: string; annual_target: number };
    const investment = invById.get(cast.investment_id);
    if (!investment || investment.type !== "CDB") return acc;
    return acc + toNum(cast.annual_target);
  }, 0);
  const cdbInvestedCapital = investments.reduce((acc, inv) => {
    if (inv.type !== "CDB") return acc;
    return acc + toNum(inv.amount_invested);
  }, 0);
  const netCashByMonth = new Map<number, number>();
  for (const row of cashEvents) {
    if (row.year !== year || row.month > month) continue;
    const type = String(row.type ?? "").toUpperCase();
    const delta = type === "APORTE" ? toNum(row.amount) : type === "RESGATE" ? -toNum(row.amount) : 0;
    netCashByMonth.set(row.month, (netCashByMonth.get(row.month) ?? 0) + delta);
  }
  const monthlyNetFlowSeries = Array.from({ length: month }, (_, i) => netCashByMonth.get(i + 1) ?? 0);
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

  // Atribuição M/M: projeção do mês (se em andamento) versus mês anterior fechado.
  const totalCurrent = currentPoint?.total ?? 0;
  const totalPrevious = previousPoint?.total ?? 0;
  const totalDelta = totalCurrent - totalPrevious;
  const attributionKeys = investments
    .map((inv) => inv.id)
    .filter((id) => (currentPoint?.values.get(id) ?? 0) > 0 || (previousPoint?.values.get(id) ?? 0) > 0);
  const attributionItems: ProfessionalInsightsPayload["attribution"]["items"] = attributionKeys.map((id) => {
    const currentValue = currentPoint?.values.get(id) ?? 0;
    const previousValue = previousPoint?.values.get(id) ?? 0;
    const deltaValue = currentValue - previousValue;
    return {
      key: id,
      label: labels.get(id) ?? id,
      currentValue,
      previousValue,
      deltaValue,
      shareCurrentPercent: totalCurrent > 0 ? (currentValue / totalCurrent) * 100 : 0,
      // Com variação total pequena (< 2% do mês anterior) a contribuição percentual perde sentido.
      contributionToDeltaPercent:
        Math.abs(totalDelta) < Math.max(0.01, totalPrevious * 0.02) ? null : (deltaValue / totalDelta) * 100,
    };
  });

  // Saúde de dados.
  const currentYearPoints = series.filter((point) => point.year === year && point.month <= month);
  const monthsWithDataSet = new Set(currentYearPoints.map((point) => point.month));
  const expectedMonths = month;
  const missingMonths = Array.from({ length: month }, (_, i) => i + 1).filter((m) => !monthsWithDataSet.has(m));
  const monthsWithData = Math.max(0, expectedMonths - missingMonths.length);
  const completenessPercent = expectedMonths > 0 ? (monthsWithData / expectedMonths) * 100 : 0;

  const duplicateKeyCount = new Map<string, number>();
  for (const row of returns) {
    if (row.year !== year || row.month > month) continue;
    const key = `${row.investment_id}-${row.year}-${row.month}`;
    duplicateKeyCount.set(key, (duplicateKeyCount.get(key) ?? 0) + 1);
  }
  const duplicateRows = Array.from(duplicateKeyCount.values()).filter((value) => value > 1).length;

  const closedPerDay = series
    .filter((point) => !point.inProgress)
    .slice(-24)
    .map((point) => point.total / point.businessDays);
  const perDayMean = mean(closedPerDay);
  const perDayStd = stdDev(closedPerDay);
  const outlierCount =
    perDayStd <= 0 ? 0 : closedPerDay.filter((value) => Math.abs((value - perDayMean) / perDayStd) >= 2.5).length;

  const entryTimestamps = [
    ...returns.filter((row) => row.year === year).map((row) => row.created_at ?? null),
    ...revisions.map((row) => row.created_at),
  ].filter((value): value is string => Boolean(value));
  const latestEntryAt = entryTimestamps.length ? entryTimestamps.sort()[entryTimestamps.length - 1] : null;
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

  // Benchmark: rendimento do mês sobre o capital aplicado versus CDI acumulado nos dias úteis do mês.
  const benchmarkWarnings: string[] = [];
  const cdiDaily = extractLatestBcbValue(cdiPayload);
  const cdiMonthPercent =
    cdiDaily !== null ? (Math.pow(1 + cdiDaily / 100, pace.totalBusinessDays) - 1) * 100 : null;
  if (cdiMonthPercent === null) benchmarkWarnings.push("CDI indisponível para benchmark.");

  const activeCapital = pace.investments.reduce((acc, item) => acc + item.invested, 0);
  const activeProjected = pace.investments.reduce((acc, item) => acc + item.projected, 0);
  const portfolioYield = activeCapital > 0 ? (activeProjected / activeCapital) * 100 : null;
  const portfolioPercentOfCdi =
    portfolioYield !== null && cdiMonthPercent !== null && cdiMonthPercent > 0
      ? (portfolioYield / cdiMonthPercent) * 100
      : null;
  const benchmarkItems = pace.investments
    .filter((item) => item.invested > 0)
    .map((item) => {
      const monthlyYieldPercent = (item.projected / item.invested) * 100;
      return {
        key: item.investmentId,
        label: item.label,
        monthlyYieldPercent,
        percentOfCdi:
          cdiMonthPercent !== null && cdiMonthPercent > 0 ? (monthlyYieldPercent / cdiMonthPercent) * 100 : null,
        contractedCdiPercent: toMaybeNum(invById.get(item.investmentId)?.cdi_rate),
      };
    });
  if (benchmarkItems.length > 0 && benchmarkItems.every((item) => item.contractedCdiPercent === null)) {
    benchmarkWarnings.push("Preencha o % do CDI contratado em Investimentos para comparar com o realizado.");
  }
  if (pace.isCurrentMonth) {
    benchmarkWarnings.push("Mês em andamento: rendimento calculado sobre a projeção de fechamento.");
  }

  const ibovSeries = extractYahooMonthlyCloses(ibovPayload);
  const ifixSeries = extractYahooMonthlyCloses(ifixPayload);
  const prevMonthRef = month > 1 ? { year, month: month - 1 } : { year: year - 1, month: 12 };
  const closeOf = (items: Array<{ year: number; month: number; close: number }>, y: number, m: number) =>
    items.find((item) => item.year === y && item.month === m)?.close ?? null;
  const ibovMom = pctChange(closeOf(ibovSeries, year, month), closeOf(ibovSeries, prevMonthRef.year, prevMonthRef.month));
  const ifixMom = pctChange(closeOf(ifixSeries, year, month), closeOf(ifixSeries, prevMonthRef.year, prevMonthRef.month));

  const riskRadar = buildRiskRadar(series);
  const capitalAt = buildCapitalResolver(investments, cashEvents);
  const recommendation = buildRecommendation(series, pace, labels, capitalAt, cdiMonthPercent);

  const benchmark: ProfessionalInsightsPayload["benchmark"] = {
    referenceMonthLabel: `${monthLabel(month)}/${year}`,
    portfolioMomPercent: portfolioYield,
    cdiMomPercent: cdiMonthPercent,
    portfolioPercentOfCdi,
    ifixMomPercent: ifixMom,
    ibovMomPercent: ibovMom,
    excessVsCdiPercent:
      portfolioYield !== null && cdiMonthPercent !== null ? portfolioYield - cdiMonthPercent : null,
    // Índices de preço não são comparáveis com rendimento de renda fixa; ficam só como contexto.
    excessVsIfixPercent: null,
    excessVsIbovPercent: null,
    items: benchmarkItems,
    warnings: benchmarkWarnings,
  };

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
      engineVersion: INSIGHTS_ENGINE_VERSION,
      recommendation: {
        action: recommendation.action,
        bestAssetKey: recommendation.bestAssetKey,
        bestAssetLabel: recommendation.bestAssetLabel,
        backtest: recommendation.backtest,
      },
      riskRadar,
      benchmark,
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
        label: pace.isCurrentMonth
          ? `Meta mensal de rendimento (CDBs) · dados até ${
              pace.asOfDate ? pace.asOfDate.split("-").reverse().slice(0, 2).join("/") : "—"
            }`
          : "Meta mensal de rendimento (CDBs)",
        targetValue: monthlyTarget > 0 ? monthlyTarget : null,
        realizedValue: monthlyRealized,
        projectedValue: monthlyProjection,
        probabilityPercent: monthlyProb,
        confidenceBand: monthlyTarget > 0 ? safeBand(monthlyProjection, monthlySigma) : null,
      },
      annualCapital: {
        label: "Meta anual de patrimônio (CDBs)",
        targetValue: annualTarget > 0 ? annualTarget : null,
        realizedValue: cdbInvestedCapital,
        projectedValue: projectedAnnualCapital,
        probabilityPercent: annualProb,
        confidenceBand: annualTarget > 0 ? safeBand(projectedAnnualCapital, annualSigma) : null,
      },
    },
    attribution: {
      monthLabel: `${monthLabel(month)}/${year}${pace.isCurrentMonth ? " (projeção)" : ""}`,
      previousMonthLabel: previousPoint ? `${monthLabel(previousPoint.month)}/${previousPoint.year}` : null,
      totalCurrent,
      totalPrevious,
      totalDelta,
      items: attributionItems,
    },
    benchmark,
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
