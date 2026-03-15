import {
  DailyInsightAction,
  DailyInsightApiPayload,
  DailyInsightHistoryItem,
  DailyInsightRadarStatus,
  DailyInsightReport,
  DashboardPayload,
} from "../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "./formatters";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toFixedNumber(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function monthIndexNow(year: number): number {
  const now = new Date();
  if (year === now.getFullYear()) return now.getMonth() + 1;
  return 12;
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

function computeRiskScore(data: DashboardPayload): number {
  let score = 0;

  const criticalAlerts = data.alerts.filter((alert) => alert.severity === "critical").length;
  const warningAlerts = data.alerts.filter((alert) => alert.severity === "warning").length;

  score += criticalAlerts * 2;
  score += warningAlerts;

  if (data.insights.anomalyDetected) score += 2;
  if ((data.kpis.momGrowth ?? 0) <= -20) score += 2;
  if ((data.kpis.momGrowth ?? 0) < 0) score += 1;
  if ((data.kpis.yoyGrowth ?? 0) < 0) score += 1;
  if (data.insights.volatilityPercent >= 35) score += 2;
  if (data.insights.forecastConfidence < 55) score += 1;
  if (!data.goalProgress.onTrack) score += 1;

  return score;
}

function radarFromRiskScore(score: number): DailyInsightRadarStatus {
  if (score >= 6) return "VERMELHO";
  if (score >= 3) return "AMARELO";
  return "VERDE";
}

function buildActionList(data: DashboardPayload, year: number): DailyInsightAction[] {
  const actions: DailyInsightAction[] = [];
  const plannedAporte = Number(process.env.FINANCEFLOW_DAILY_PLANNED_APORTE ?? 1000);
  const safeAporte = Number.isFinite(plannedAporte) && plannedAporte > 0 ? plannedAporte : 1000;
  const monthNow = monthIndexNow(year);
  const monthsRemaining = Math.max(1, 12 - monthNow + 1);
  const requiredPerMonth = data.goalProgress.gapToTarget / monthsRemaining;

  if (!data.goalProgress.onTrack && data.goalProgress.gapToTarget > 0) {
    actions.push({
      id: "run-rate-recovery",
      title: "Recuperar run-rate mensal",
      rationale:
        "A projeção anual está abaixo da meta, então o ajuste de ritmo precisa acontecer já no mês atual.",
      expectedImpact: `Elevar média mensal para ~${formatCurrencyBRL(requiredPerMonth)} até dezembro.`,
      priority: "high",
    });
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

  if ((data.kpis.momGrowth ?? 0) < 0 || data.insights.anomalyDetected) {
    actions.push({
      id: "investigate-drop",
      title: "Investigar queda mensal antes de novo risco",
      rationale:
        "Houve deterioração recente e é melhor atacar causa (fluxo, sazonalidade ou erro de lançamento) antes de escalar exposição.",
      expectedImpact: "Redução de ruído e melhor assertividade dos próximos aportes.",
      priority: "high",
    });
  }

  return actions.slice(0, 4);
}

function buildRisks(data: DashboardPayload): DailyInsightReport["risks"] {
  const risks: DailyInsightReport["risks"] = [];

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

  if ((data.kpis.momGrowth ?? 0) < -15) {
    risks.push({
      id: "mom-drop",
      title: "Queda forte mês contra mês",
      level: "high",
      description:
        "O ritmo de renda passiva caiu de forma relevante versus o período imediatamente anterior.",
      trigger: `MoM ${formatPercentage(data.kpis.momGrowth ?? 0)}`,
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

function buildEvidence(data: DashboardPayload, year: number): DailyInsightReport["evidence"] {
  const monthNow = monthIndexNow(year);
  return [
    {
      id: "ev-current-month-income",
      label: `Renda de ${monthLabel(monthNow)}`,
      value: formatCurrencyBRL(data.kpis.totalPassiveIncomeCurrentMonth),
      context: "Renda passiva mensal atual",
    },
    {
      id: "ev-mom",
      label: "Crescimento MoM",
      value: formatPercentage(data.kpis.momGrowth ?? 0),
      context: "Variação versus mês anterior",
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
  ];
}

export function buildDailyInsightReport(
  data: DashboardPayload,
  year: number,
  runDate: string,
): DailyInsightReport {
  const riskScore = computeRiskScore(data);
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
      ? "Carteira com direção estável e espaço para otimização fina"
      : radarStatus === "AMARELO"
        ? "Carteira em atenção: ajustes táticos podem evitar perda de ritmo"
        : "Carteira em alerta: ação corretiva imediata recomendada";

  const summary =
    `Resumo diário ${runDate}: renda mensal em ${formatCurrencyBRL(
      data.kpis.totalPassiveIncomeCurrentMonth,
    )}, projeção anual em ${formatCurrencyBRL(data.kpis.annualProjection)} e gap de ${formatCurrencyBRL(
      data.goalProgress.gapToTarget,
    )} para a meta. Melhor fonte atual: ${mapBestSourceToLabel(data.insights.bestSource)}.`;

  const priorityAction =
    buildActionList(data, year)[0]?.title ??
    "Manter disciplina de lançamento e revisar tendência no próximo fechamento.";

  return {
    runDate,
    year,
    generatedAt: new Date().toISOString(),
    generatedBy: "rule",
    model: null,
    radarStatus,
    confidencePercent,
    headline,
    summary,
    priorityAction,
    actions: buildActionList(data, year),
    risks: buildRisks(data),
    evidence: buildEvidence(data, year),
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
