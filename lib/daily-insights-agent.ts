import {
  DailyInsightAction,
  DailyInsightApiPayload,
  DailyInsightGoalContext,
  DailyInsightHistoryItem,
  DailyInsightRadarStatus,
  DailyInsightReport,
  DashboardPayload,
} from "../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "./formatters";

type MonthlyPaceContext = {
  analysisMonth: number;
  analysisYear: number;
  isCurrentContextMonth: boolean;
  elapsedBusinessDays: number | null;
  totalBusinessDays: number | null;
  elapsedRatio: number | null;
  previousMonthTotal: number | null;
  expectedSoFarFromPrevious: number | null;
  projectedFullMonth: number | null;
  projectedVsPreviousPercent: number | null;
  paceDeltaPercent: number | null;
  isEarlyMonth: boolean;
};

const DAILY_INSIGHTS_ENGINE_VERSION = "2026-04-12-v2";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toFixedNumber(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
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

function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day };
}

function findMonthTotal(series: DashboardPayload["monthlySeries"], year: number, month: number): number | null {
  const point = series.find((item) => item.year === year && item.month === month);
  if (!point) return null;
  return Number(point.total ?? 0);
}

function resolveMonthlyPaceContext(
  data: DashboardPayload,
  year: number,
  analysisMonth: number,
  runDate: string,
): MonthlyPaceContext {
  const todayParts = parseIsoDateParts(runDate);
  const isCurrentContextMonth =
    todayParts !== null &&
    year === todayParts.year &&
    analysisMonth === todayParts.month;

  const elapsedBusinessDays =
    isCurrentContextMonth && todayParts !== null
      ? countBusinessDaysElapsedInMonth(year, analysisMonth, todayParts.day)
      : null;
  const totalBusinessDays =
    isCurrentContextMonth ? countBusinessDaysInMonth(year, analysisMonth) : null;
  const elapsedRatio =
    elapsedBusinessDays !== null &&
    totalBusinessDays !== null &&
    totalBusinessDays > 0
      ? elapsedBusinessDays / totalBusinessDays
      : null;

  const previousMonth = analysisMonth > 1 ? analysisMonth - 1 : 12;
  const previousYear = analysisMonth > 1 ? year : year - 1;
  const previousMonthTotal = findMonthTotal(data.monthlySeries, previousYear, previousMonth);
  const currentIncome = Number(data.kpis.totalPassiveIncomeCurrentMonth ?? 0);

  const expectedSoFarFromPrevious =
    isCurrentContextMonth &&
    previousMonthTotal !== null &&
    previousMonthTotal > 0 &&
    elapsedRatio !== null
      ? previousMonthTotal * elapsedRatio
      : null;

  const projectedFullMonth =
    isCurrentContextMonth && elapsedRatio !== null && elapsedRatio > 0
      ? currentIncome / elapsedRatio
      : currentIncome;

  const projectedVsPreviousPercent =
    previousMonthTotal !== null && previousMonthTotal > 0
      ? ((projectedFullMonth - previousMonthTotal) / previousMonthTotal) * 100
      : null;

  const paceDeltaPercent =
    expectedSoFarFromPrevious !== null && expectedSoFarFromPrevious > 0
      ? ((currentIncome - expectedSoFarFromPrevious) / expectedSoFarFromPrevious) * 100
      : null;

  const isEarlyMonth =
    isCurrentContextMonth && elapsedRatio !== null ? elapsedRatio <= 0.45 : false;

  return {
    analysisMonth,
    analysisYear: year,
    isCurrentContextMonth,
    elapsedBusinessDays,
    totalBusinessDays,
    elapsedRatio,
    previousMonthTotal,
    expectedSoFarFromPrevious,
    projectedFullMonth,
    projectedVsPreviousPercent,
    paceDeltaPercent,
    isEarlyMonth,
  };
}

export function getSaoPauloDateISO(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

function mapBestSourceToLabel(bestSource: DashboardPayload["insights"]["bestSource"]): string {
  if (bestSource === "CDB_ITAU") return "CDB Itaú";
  if (bestSource === "CDB_OTHER") return "CDB Santander";
  return "FIIs";
}

export function buildDailyInsightDataSignature(
  data: DashboardPayload,
  goalContext?: DailyInsightGoalContext | null,
): string {
  const latestMonth = data.monthlySeries[data.monthlySeries.length - 1]?.month ?? null;
  return JSON.stringify({
    engineVersion: DAILY_INSIGHTS_ENGINE_VERSION,
    latestMonth,
    monthIncome: toFixedNumber(data.kpis.totalPassiveIncomeCurrentMonth, 2),
    monthCdb: toFixedNumber(data.kpis.cdbTotalYieldCurrentMonth, 2),
    monthFii: toFixedNumber(data.kpis.fiiDividendsCurrentMonth, 2),
    mom: toFixedNumber(data.kpis.momGrowth ?? 0, 2),
    yoy: toFixedNumber(data.kpis.yoyGrowth ?? 0, 2),
    ytd: toFixedNumber(data.kpis.ytdPassiveIncome, 2),
    annualProjection: toFixedNumber(data.kpis.annualProjection, 2),
    annualTarget: toFixedNumber(data.goalProgress.annualIncomeTarget, 2),
    gap: toFixedNumber(data.goalProgress.gapToTarget, 2),
    goalMonthlyTarget:
      goalContext?.monthlyIncomeTarget === null || goalContext?.monthlyIncomeTarget === undefined
        ? null
        : toFixedNumber(goalContext.monthlyIncomeTarget, 2),
    goalMonth: goalContext?.month ?? null,
    goalMonthlyRealized:
      goalContext?.monthlyIncomeRealized === null || goalContext?.monthlyIncomeRealized === undefined
        ? null
        : toFixedNumber(goalContext.monthlyIncomeRealized, 2),
    goalAnnualTarget:
      goalContext?.annualCapitalTarget === null || goalContext?.annualCapitalTarget === undefined
        ? null
        : toFixedNumber(goalContext.annualCapitalTarget, 2),
    goalAnnualCurrent:
      goalContext?.annualCapitalCurrent === null || goalContext?.annualCapitalCurrent === undefined
        ? null
        : toFixedNumber(goalContext.annualCapitalCurrent, 2),
  });
}

function buildGoalContextSummary(
  data: DashboardPayload,
  goalContext?: DailyInsightGoalContext | null,
): string {
  if (goalContext) {
    const monthlyPart =
      goalContext.monthlyIncomeTarget !== null && goalContext.monthlyIncomeTarget > 0
        ? goalContext.monthlyIncomeGap !== null && goalContext.monthlyIncomeGap > 0
          ? `meta mensal CDB: ${formatCurrencyBRL(
              goalContext.monthlyIncomeRealized,
            )} de ${formatCurrencyBRL(goalContext.monthlyIncomeTarget)} (faltam ${formatCurrencyBRL(
              goalContext.monthlyIncomeGap,
            )})`
          : `meta mensal CDB atingida (${formatCurrencyBRL(
              goalContext.monthlyIncomeRealized,
            )} de ${formatCurrencyBRL(goalContext.monthlyIncomeTarget)})`
        : "meta mensal CDB não configurada";

    const annualPart =
      goalContext.annualCapitalTarget !== null && goalContext.annualCapitalTarget > 0
        ? goalContext.annualCapitalGap !== null && goalContext.annualCapitalGap > 0
          ? `meta anual de patrimônio: ${formatCurrencyBRL(
              goalContext.annualCapitalCurrent,
            )} de ${formatCurrencyBRL(goalContext.annualCapitalTarget)} (faltam ${formatCurrencyBRL(
              goalContext.annualCapitalGap,
            )})`
          : `meta anual de patrimônio atingida (${formatCurrencyBRL(
              goalContext.annualCapitalCurrent,
            )} de ${formatCurrencyBRL(goalContext.annualCapitalTarget)})`
        : "meta anual de patrimônio não configurada";

    return `${monthlyPart}; ${annualPart}`;
  }

  const annualTarget = data.goalProgress.annualIncomeTarget;
  const annualProjection = data.kpis.annualProjection;
  const gap = data.goalProgress.gapToTarget;

  if (annualTarget <= 0) {
    return "meta anual não configurada";
  }

  if (gap <= 0) {
    const surplus = Math.max(annualProjection - annualTarget, 0);
    if (surplus > 0) {
      return `meta anual superada em ${formatCurrencyBRL(surplus)}`;
    }
    return "meta anual no limite projetado";
  }

  return `faltam ${formatCurrencyBRL(gap)} para a meta anual`;
}

function normalizedMomDropPercent(data: DashboardPayload, pace: MonthlyPaceContext): number | null {
  if (pace.projectedVsPreviousPercent !== null) return pace.projectedVsPreviousPercent;
  return data.kpis.momGrowth;
}

function computeRiskScore(
  data: DashboardPayload,
  pace: MonthlyPaceContext,
  goalContext?: DailyInsightGoalContext | null,
): number {
  let score = 0;
  const enforceMonthDropSignals = !pace.isCurrentContextMonth || !pace.isEarlyMonth;

  const alertsScore = data.alerts.reduce((acc, alert) => {
    if (alert.code === "MOM_SHARP_DROP" && pace.isCurrentContextMonth) {
      if (!enforceMonthDropSignals) return acc;
      if (pace.paceDeltaPercent !== null && pace.paceDeltaPercent >= -12) return acc;
    }
    if (alert.severity === "critical") return acc + 2;
    if (alert.severity === "warning") return acc + 1;
    return acc;
  }, 0);

  score += alertsScore;

  if (data.insights.anomalyDetected) score += 2;
  const momReference = normalizedMomDropPercent(data, pace);
  if (enforceMonthDropSignals) {
    if ((momReference ?? 0) <= -20) score += 2;
    if ((momReference ?? 0) < 0) score += 1;
  }
  if ((data.kpis.yoyGrowth ?? 0) < 0 && (!pace.isCurrentContextMonth || !pace.isEarlyMonth)) score += 1;
  if (data.insights.volatilityPercent >= 35) score += 2;
  if (data.insights.forecastConfidence < 55) score += 1;
  if (!data.goalProgress.onTrack) {
    if (pace.isCurrentContextMonth && pace.isEarlyMonth && (momReference ?? 0) > -8) {
      score += 0.5;
    } else {
      score += 1;
    }
  }
  if (
    enforceMonthDropSignals &&
    pace.isCurrentContextMonth &&
    pace.paceDeltaPercent !== null &&
    pace.paceDeltaPercent <= -20 &&
    goalContext?.monthlyIncomeTarget !== null
  ) {
    score += 1.5;
  }

  return score;
}

function radarFromRiskScore(score: number): DailyInsightRadarStatus {
  if (score >= 6) return "VERMELHO";
  if (score >= 3) return "AMARELO";
  return "VERDE";
}

function buildActionList(
  data: DashboardPayload,
  analysisMonth: number,
  pace: MonthlyPaceContext,
): DailyInsightAction[] {
  const actions: DailyInsightAction[] = [];
  const plannedAporte = Number(process.env.FINANCEFLOW_DAILY_PLANNED_APORTE ?? 1000);
  const safeAporte = Number.isFinite(plannedAporte) && plannedAporte > 0 ? plannedAporte : 1000;
  const monthsRemaining = Math.max(1, 12 - analysisMonth + 1);
  const requiredPerMonth = data.goalProgress.gapToTarget / monthsRemaining;
  const momReference = normalizedMomDropPercent(data, pace);

  if (!data.goalProgress.onTrack && data.goalProgress.gapToTarget > 0) {
    const relaxedEarlyMonth = pace.isCurrentContextMonth && pace.isEarlyMonth && (momReference ?? 0) > -10;
    actions.push({
      id: "run-rate-recovery",
      title: relaxedEarlyMonth ? "Consolidar ritmo diário para fechar o mês no alvo" : "Recuperar run-rate mensal",
      rationale: relaxedEarlyMonth
        ? "Início de mês tende a distorcer MoM. O foco deve ser manter cadência diária acima do ritmo de referência."
        : "A projeção anual está abaixo da meta, então o ajuste de ritmo precisa acontecer já no mês atual.",
      expectedImpact: relaxedEarlyMonth
        ? `Sustentar ritmo para convergir a ~${formatCurrencyBRL(requiredPerMonth)} por mês até dezembro.`
        : `Elevar média mensal para ~${formatCurrencyBRL(requiredPerMonth)} até dezembro.`,
      priority: relaxedEarlyMonth ? "medium" : "high",
    });
  }

  if (pace.isCurrentContextMonth && pace.paceDeltaPercent !== null && !pace.isEarlyMonth) {
    if (pace.paceDeltaPercent <= -12) {
      actions.push({
        id: "recover-daily-pace",
        title: "Acelerar ritmo diário para reduzir desvio do mês",
        rationale:
          "No ponto atual do mês, o realizado está abaixo do ritmo necessário para igualar o fechamento anterior.",
        expectedImpact: `Desvio atual de ritmo: ${formatPercentage(
          pace.paceDeltaPercent,
        )} vs referência de ${monthLabel(analysisMonth > 1 ? analysisMonth - 1 : 12)}.`,
        priority: "high",
      });
    } else if (pace.paceDeltaPercent >= 8) {
      actions.push({
        id: "lock-pace-gain",
        title: "Preservar ritmo acima da referência mensal",
        rationale:
          "A carteira está rodando acima do mês anterior no mesmo ponto do calendário útil.",
        expectedImpact: `Ritmo atual ${formatPercentage(
          pace.paceDeltaPercent,
        )} acima do esperado no mesmo ponto do mês.`,
        priority: "low",
      });
    }
  }

  const bestSource = mapBestSourceToLabel(data.insights.bestSource);
  actions.push({
    id: "next-aporte-allocation",
    title: `Direcionar próximo aporte para ${bestSource}`,
    rationale:
      "A melhor fonte recente de rendimento está liderando o desempenho e tende a melhorar eficiência do aporte incremental.",
    expectedImpact: `Simulação base: aporte de ${formatCurrencyBRL(safeAporte)} focado em ${bestSource}.`,
    priority: data.goalProgress.onTrack ? "medium" : "high",
  });

  const fiiShare = data.distribution.fii;
  if (fiiShare > 0) {
    actions.push({
      id: "fii-reinvestment-mix",
      title: "Reinvestir dividendos FIIs com balanceamento dinâmico",
      rationale:
        "A alocação tijolo/papel usa regime de juros e inflação para reduzir risco de concentração temática.",
      expectedImpact: `Mix sugerido: Tijolo ${formatPercentage(
        data.insights.fiiReinvestment.tijoloPercent,
      )} | Papel ${formatPercentage(data.insights.fiiReinvestment.papelPercent)}.`,
      priority: "medium",
    });
  }

  const shouldInvestigateDrop =
    data.insights.anomalyDetected ||
    ((momReference ?? 0) < -12 && (!pace.isCurrentContextMonth || !pace.isEarlyMonth));

  if (shouldInvestigateDrop) {
    actions.push({
      id: "investigate-drop",
      title: "Investigar queda mensal antes de novo risco",
      rationale:
        "Houve deterioração recente e é melhor atacar causa (fluxo, sazonalidade ou erro de lançamento) antes de escalar exposição.",
      expectedImpact: "Redução de ruído e melhor assertividade dos próximos aportes.",
      priority: (momReference ?? 0) <= -20 ? "high" : "medium",
    });
  }

  return actions.slice(0, 4);
}

function buildRisks(data: DashboardPayload, pace: MonthlyPaceContext): DailyInsightReport["risks"] {
  const risks: DailyInsightReport["risks"] = [];
  const momReference = normalizedMomDropPercent(data, pace);
  const enforceMonthDropSignals = !pace.isCurrentContextMonth || !pace.isEarlyMonth;

  if (data.insights.anomalyDetected) {
    risks.push({
      id: "anomaly",
      title: "Anomalia detectada na série",
      level: "high",
      description: data.insights.anomalyReason ?? "Oscilação fora do padrão histórico detectada.",
      trigger: "Insight de anomalia no motor de previsão",
    });
  }

  if (data.insights.volatilityPercent >= 30) {
    risks.push({
      id: "volatility",
      title: "Volatilidade elevada",
      level: "medium",
      description:
        "Variações recentes aumentaram e podem reduzir previsibilidade do fechamento mensal.",
      trigger: `Volatilidade em ${formatPercentage(data.insights.volatilityPercent)}`,
    });
  }

  if ((momReference ?? 0) < -15 && enforceMonthDropSignals) {
    risks.push({
      id: "mom-drop",
      title: "Queda forte mês contra mês",
      level: "high",
      description:
        "A projeção de fechamento do mês está abaixo do mês anterior de forma relevante.",
      trigger: `Queda estimada ${formatPercentage(momReference ?? 0)} vs mês anterior`,
    });
  }

  if (
    pace.isCurrentContextMonth &&
    pace.paceDeltaPercent !== null &&
    pace.paceDeltaPercent <= -12 &&
    !pace.isEarlyMonth
  ) {
    risks.push({
      id: "pace-below-reference",
      title: "Ritmo diário abaixo da referência",
      level: pace.paceDeltaPercent <= -20 ? "high" : "medium",
      description:
        "No mesmo ponto de dias úteis, o realizado está abaixo da referência do mês anterior.",
      trigger: `Ritmo ${formatPercentage(pace.paceDeltaPercent)} vs referência diária`,
    });
  }

  if (!data.goalProgress.onTrack) {
    risks.push({
      id: "target-gap",
      title: "Gap para meta anual",
      level: "medium",
      description:
        "Com o ritmo atual, a meta anual exige aceleração dos próximos meses.",
      trigger: `Gap atual ${formatCurrencyBRL(data.goalProgress.gapToTarget)}`,
    });
  }

  if (pace.isCurrentContextMonth && pace.isEarlyMonth && (momReference ?? 0) > -12) {
    risks.push({
      id: "early-month-noise",
      title: "Leitura parcial de início de mês",
      level: "low",
      description:
        "No começo do mês a comparação MoM tende a ficar distorcida; o foco deve ser ritmo por dia útil.",
      trigger: `Parcial de ${pace.elapsedBusinessDays ?? 0} de ${pace.totalBusinessDays ?? 0} dias úteis`,
    });
  }

  if (risks.length === 0) {
    risks.push({
      id: "baseline",
      title: "Sem risco crítico imediato",
      level: "low",
      description: "Indicadores principais estão dentro da faixa esperada para o período.",
      trigger: "Sem alertas críticos ativos",
    });
  }

  return risks.slice(0, 4);
}

function buildEvidence(
  data: DashboardPayload,
  analysisMonth: number,
  pace: MonthlyPaceContext,
): DailyInsightReport["evidence"] {
  const momReference = normalizedMomDropPercent(data, pace);
  const projectedValue =
    pace.projectedFullMonth !== null ? pace.projectedFullMonth : data.kpis.totalPassiveIncomeCurrentMonth;
  const vsPreviousLabel = monthLabel(analysisMonth > 1 ? analysisMonth - 1 : 12);
  return [
    {
      id: "ev-current-month-income",
      label: `Renda de ${monthLabel(analysisMonth)}`,
      value: formatCurrencyBRL(data.kpis.totalPassiveIncomeCurrentMonth),
      context: "Renda passiva mensal atual",
    },
    {
      id: "ev-mom",
      label: "Projeção vs mês anterior",
      value: formatPercentage(momReference ?? 0),
      context: pace.isCurrentContextMonth
        ? `Com base no ritmo atual (${monthLabel(analysisMonth)} projetado vs ${vsPreviousLabel})`
        : "Variação versus mês anterior",
    },
    {
      id: "ev-month-pace",
      label: "Ritmo por dia útil",
      value:
        pace.paceDeltaPercent !== null
          ? formatPercentage(pace.paceDeltaPercent)
          : "Sem base comparável",
      context:
        pace.elapsedBusinessDays !== null && pace.totalBusinessDays !== null
          ? `${pace.elapsedBusinessDays}/${pace.totalBusinessDays} dias úteis corridos no mês`
          : "Comparativo de ritmo disponível somente no mês corrente",
    },
    {
      id: "ev-projected-close",
      label: "Fechamento estimado do mês",
      value: formatCurrencyBRL(projectedValue),
      context: "Estimado pelo ritmo atual de lançamentos",
    },
    {
      id: "ev-yoy",
      label: "Crescimento YoY",
      value: formatPercentage(data.kpis.yoyGrowth ?? 0),
      context: "Variação versus mesmo mês do ano anterior",
    },
    {
      id: "ev-forecast",
      label: "Previsão próximo mês",
      value: formatCurrencyBRL(data.insights.forecastNextMonth),
      context: `Confiança ${formatPercentage(data.insights.forecastConfidence)}`,
    },
    {
      id: "ev-goal",
      label: "Progresso anual",
      value: formatPercentage(data.goalProgress.progressPercent),
      context: `Gap ${formatCurrencyBRL(data.goalProgress.gapToTarget)}`,
    },
    {
      id: "ev-best-source",
      label: "Melhor fonte",
      value: mapBestSourceToLabel(data.insights.bestSource),
      context: "Fonte líder no período recente",
    },
  ].slice(0, 6);
}

export function buildDailyInsightReport(
  data: DashboardPayload,
  year: number,
  analysisMonth: number,
  runDate: string,
  goalContext?: DailyInsightGoalContext | null,
): DailyInsightReport {
  const pace = resolveMonthlyPaceContext(data, year, analysisMonth, runDate);
  const riskScore = computeRiskScore(data, pace, goalContext);
  const radarStatus = radarFromRiskScore(riskScore);
  const alertPenalty = data.alerts.length * 3;
  const riskPenalty = riskScore * 4;
  const confidencePercent = clamp(
    toFixedNumber(data.insights.forecastConfidence - alertPenalty - riskPenalty, 1),
    35,
    96,
  );

  const headline =
    radarStatus === "VERDE"
      ? pace.isCurrentContextMonth && pace.isEarlyMonth
        ? "Carteira em ritmo saudável para o estágio atual do mês"
        : "Carteira com direção estável e espaço para otimização fina"
      : radarStatus === "AMARELO"
        ? pace.isCurrentContextMonth
          ? "Carteira em atenção: ritmo do mês pede ajuste tático"
          : "Carteira em atenção: ajustes táticos podem evitar perda de ritmo"
        : "Carteira em alerta: ação corretiva imediata recomendada";

  const vsPrevReference =
    pace.projectedVsPreviousPercent !== null ? pace.projectedVsPreviousPercent : data.kpis.momGrowth ?? 0;
  const paceSnippet =
    pace.isCurrentContextMonth && pace.elapsedBusinessDays !== null && pace.totalBusinessDays !== null
      ? `ritmo de ${pace.elapsedBusinessDays}/${pace.totalBusinessDays} dias úteis, projeção mensal em ${formatCurrencyBRL(
          pace.projectedFullMonth ?? data.kpis.totalPassiveIncomeCurrentMonth,
        )} (${formatPercentage(vsPrevReference)} vs mês anterior)`
      : `renda do mês em ${formatCurrencyBRL(data.kpis.totalPassiveIncomeCurrentMonth)} (${formatPercentage(
          data.kpis.momGrowth ?? 0,
        )} vs mês anterior)`;

  const summary =
    `Resumo diário ${runDate}: ${paceSnippet}, projeção anual em ${formatCurrencyBRL(
      data.kpis.annualProjection,
    )} e ${buildGoalContextSummary(data, goalContext)}. Melhor fonte atual: ${mapBestSourceToLabel(
      data.insights.bestSource,
    )}.`;

  const actions = buildActionList(data, analysisMonth, pace);
  const priorityAction =
    actions[0]?.title ??
    "Manter disciplina de lançamento e revisar tendência no próximo fechamento.";

  return {
    runDate,
    year,
    generatedAt: new Date().toISOString(),
    generatedBy: "rule",
    model: null,
    goalContext: goalContext ?? undefined,
    radarStatus,
    confidencePercent,
    headline,
    summary,
    priorityAction,
    actions,
    risks: buildRisks(data, pace),
    evidence: buildEvidence(data, analysisMonth, pace),
    dataSignature: buildDailyInsightDataSignature(data, goalContext),
  };
}

function parseJsonObjectFromText(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const direct = (() => {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (direct) return direct;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  const slice = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toPriority(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

async function callOpenAiDailyInsight(
  apiKey: string,
  model: string,
  baseReport: DailyInsightReport,
): Promise<Record<string, unknown> | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Você é um analista financeiro quantitativo para carteira pessoal (CDB/FII). Gere saída objetiva em JSON válido, sem markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Reescreva headline/summary/priorityAction e refine actions/risks com linguagem objetiva.",
            constraints: {
              language: "pt-BR",
              no_hype: true,
              max_actions: 4,
              max_risks: 4,
            },
            output_schema: {
              headline: "string",
              summary: "string",
              priorityAction: "string",
              actions: [
                {
                  id: "string",
                  title: "string",
                  rationale: "string",
                  expectedImpact: "string",
                  priority: "high|medium|low",
                },
              ],
              risks: [
                {
                  id: "string",
                  title: "string",
                  level: "low|medium|high",
                  description: "string",
                  trigger: "string",
                },
              ],
            },
            input_report: baseReport,
          }),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  return parseJsonObjectFromText(content);
}

export async function maybeEnhanceDailyInsightWithLlm(
  baseReport: DailyInsightReport,
): Promise<DailyInsightReport> {
  const enabled = process.env.FINANCEFLOW_INSIGHTS_LLM_ENABLED === "1";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.FINANCEFLOW_INSIGHTS_LLM_MODEL ?? "gpt-4o-mini";

  if (!enabled || !apiKey) return baseReport;

  try {
    const json = await callOpenAiDailyInsight(apiKey, model, baseReport);
    if (!json) return baseReport;

    const actionsRaw = Array.isArray(json.actions) ? json.actions : baseReport.actions;
    const actions = actionsRaw
      .map((item, idx) => {
        const action = item as Record<string, unknown>;
        return {
          id: toStringSafe(action.id, `action-${idx + 1}`),
          title: toStringSafe(action.title, baseReport.actions[idx]?.title ?? "Ação"),
          rationale: toStringSafe(action.rationale, ""),
          expectedImpact: toStringSafe(action.expectedImpact, ""),
          priority: toPriority(action.priority),
        };
      })
      .filter((item) => item.title)
      .slice(0, 4);

    const risksRaw = Array.isArray(json.risks) ? json.risks : baseReport.risks;
    const risks = risksRaw
      .map((item, idx) => {
        const risk = item as Record<string, unknown>;
        const level = risk.level;
        return {
          id: toStringSafe(risk.id, `risk-${idx + 1}`),
          title: toStringSafe(risk.title, baseReport.risks[idx]?.title ?? "Risco"),
          level:
            level === "low" || level === "medium" || level === "high"
              ? level
              : (baseReport.risks[idx]?.level ?? "medium"),
          description: toStringSafe(risk.description, ""),
          trigger: toStringSafe(risk.trigger, ""),
        };
      })
      .slice(0, 4);

    return {
      ...baseReport,
      generatedBy: "llm",
      model,
      headline: toStringSafe(json.headline, baseReport.headline),
      summary: toStringSafe(json.summary, baseReport.summary),
      priorityAction: toStringSafe(json.priorityAction, baseReport.priorityAction),
      actions: actions.length > 0 ? actions : baseReport.actions,
      risks: risks.length > 0 ? risks : baseReport.risks,
    };
  } catch {
    return baseReport;
  }
}

export function summarizeHistoryFromRows(rows: Array<Record<string, unknown>>): DailyInsightHistoryItem[] {
  return rows
    .map((row) => {
      const runDate = toStringSafe(row.run_date, "");
      const radarStatus = toStringSafe(row.radar_status, "AMARELO") as DailyInsightRadarStatus;
      const confidencePercent = Number(row.confidence_percent ?? 0);
      const headline = toStringSafe(row.headline, "");
      const generatedByRaw = toStringSafe(row.generated_by, "rule");
      const generatedBy: "rule" | "llm" = generatedByRaw === "llm" ? "llm" : "rule";
      return {
        runDate,
        radarStatus:
          radarStatus === "VERDE" || radarStatus === "AMARELO" || radarStatus === "VERMELHO"
            ? radarStatus
            : "AMARELO",
        confidencePercent: Number.isFinite(confidencePercent) ? confidencePercent : 0,
        headline,
        generatedBy,
      };
    })
    .filter((item) => item.runDate)
    .slice(0, 14);
}

export function buildFallbackDailyInsightPayload(
  report: DailyInsightReport,
  warnings: string[],
): DailyInsightApiPayload {
  return {
    source: "generated",
    warnings,
    report,
    history: [
      {
        runDate: report.runDate,
        radarStatus: report.radarStatus,
        confidencePercent: report.confidencePercent,
        headline: report.headline,
        generatedBy: report.generatedBy,
      },
    ],
  };
}
