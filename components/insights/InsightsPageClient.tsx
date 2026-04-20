"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DailyInsightApiPayload,
  DashboardPayload,
  MarketSnapshotPayload,
  ProfessionalInsightsPayload,
} from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { InsightsPanel } from "../dashboard/InsightsPanel";

interface Props {
  data: DashboardPayload;
  dailyInsights: DailyInsightApiPayload | null;
  marketSnapshot: MarketSnapshotPayload | null;
  professionalInsights: ProfessionalInsightsPayload | null;
  year: number;
}

function buildForecastSeries(data: DashboardPayload) {
  const realized: Array<{
    label: string;
    realized: number | null;
    forecastBridge: number | null;
  }> = data.monthlySeries.map((m) => ({
    label: monthLabel(m.month),
    realized: m.total,
    forecastBridge: null,
  }));

  if (realized.length > 0) {
    const lastIndex = realized.length - 1;
    realized[lastIndex].forecastBridge = realized[lastIndex].realized;
  }

  const lastMonth = data.monthlySeries[data.monthlySeries.length - 1]?.month ?? 12;
  const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
  realized.push({
    label: `${monthLabel(nextMonth)}*`,
    realized: null,
    forecastBridge: data.insights.forecastNextMonth,
  });

  return realized;
}

function buildDistributionSeries(data: DashboardPayload) {
  return [
    { source: "CDB Itaú", value: data.distribution.itauCdb },
    { source: "CDB Santander", value: data.distribution.otherCdb },
    { source: "FIIs", value: data.distribution.fii },
  ];
}

type DriverInsight = {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
  sharePct: number;
};

type OperationalInsights = {
  currentMonth: number;
  currentTotal: number;
  expectedToDate: number;
  projectedClose: number;
  pacePercent: number | null;
  elapsedBusinessDays: number;
  totalBusinessDays: number;
  ytd: number;
  targetAnnual: number;
  remainingToTarget: number;
  monthsRemaining: number;
  requiredPerMonth: number;
  recentAverage: number;
  cdiReference: number;
  stressScenarios: Array<{ label: string; impact: number; simulatedTotal: number }>;
  drivers: DriverInsight[];
  priorityAction: string;
};

function marketRegimeLabel(
  regime: DashboardPayload["insights"]["fiiReinvestment"]["marketRegime"],
): string {
  if (regime === "JUROS_RESTRITIVOS") return "Juros restritivos";
  if (regime === "AFROUXAMENTO_MONETARIO") return "Afrouxamento monetário";
  if (regime === "INFLACAO_REACELERANDO") return "Inflação reacelerando";
  return "Regime equilibrado";
}

function radarStyle(status: "VERDE" | "AMARELO" | "VERMELHO") {
  if (status === "VERDE") return "bg-emerald-900/40 text-emerald-300 border-emerald-700/70";
  if (status === "AMARELO") return "bg-amber-900/40 text-amber-300 border-amber-700/70";
  return "bg-rose-900/40 text-rose-300 border-rose-700/70";
}

function priorityLabel(priority: "high" | "medium" | "low") {
  if (priority === "high") return "Alta";
  if (priority === "medium") return "Média";
  return "Baixa";
}

function priorityStyle(priority: "high" | "medium" | "low") {
  if (priority === "high") return "text-rose-300";
  if (priority === "medium") return "text-amber-300";
  return "text-emerald-300";
}

function formatTrendPp(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "estável";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} p.p.`;
}

function formatPoints(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} pts`;
}

function formatUsd(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSnapshotDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizeTinyPercent(value: number): number {
  return Math.abs(value) < 0.005 ? 0 : value;
}

function signedDayVariation(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const normalized = normalizeTinyPercent(value);
  const signal = normalized > 0 ? "▲ " : normalized < 0 ? "▼ " : "• ";
  const signed =
    normalized > 0 ? `+${normalized.toFixed(2)}%` : `${normalized.toFixed(2)}%`;
  return `${signal}${signed}`;
}

function dayVariationTone(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "text-slate-400";
  const normalized = normalizeTinyPercent(value);
  if (normalized > 0) return "text-emerald-300";
  if (normalized < 0) return "text-rose-300";
  return "text-slate-300";
}

function marketCardTone(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "border-slate-700 bg-slate-800/40";
  const normalized = normalizeTinyPercent(value);
  if (normalized > 0) return "border-emerald-500/60 bg-emerald-950/20";
  if (normalized < 0) return "border-rose-500/60 bg-rose-950/20";
  return "border-slate-700 bg-slate-800/40";
}

function marketValueTone(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "text-slate-100";
  const normalized = normalizeTinyPercent(value);
  if (normalized > 0) return "text-emerald-300";
  if (normalized < 0) return "text-rose-300";
  return "text-slate-100";
}

function goalProgressTone(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "text-slate-300";
  if (value >= 100) return "text-emerald-300";
  if (value >= 80) return "text-amber-300";
  return "text-rose-300";
}

function goalCardTone(progress: number | null): string {
  if (progress === null || Number.isNaN(progress)) return "border-slate-700 bg-slate-800/40";
  if (progress >= 100) return "border-emerald-600/50 bg-emerald-950/20";
  if (progress >= 80) return "border-amber-600/50 bg-amber-950/20";
  return "border-rose-600/50 bg-rose-950/20";
}

function qualityGradeTone(grade: "A" | "B" | "C"): string {
  if (grade === "A") return "text-emerald-300";
  if (grade === "B") return "text-amber-300";
  return "text-rose-300";
}

function signedCurrency(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCurrencyBRL(Math.abs(value))}`;
}

function signedPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(1)}%`;
}

function riskRegimeTone(regime: "ESTAVEL" | "ATENCAO" | "ESTRESSADO"): string {
  if (regime === "ESTAVEL") return "text-emerald-300";
  if (regime === "ATENCAO") return "text-amber-300";
  return "text-rose-300";
}

function diagnosticAlertTone(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "border-rose-700/70 bg-rose-950/30 text-rose-200";
  if (severity === "medium") return "border-amber-700/70 bg-amber-950/30 text-amber-200";
  return "border-emerald-700/70 bg-emerald-950/30 text-emerald-200";
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function countBusinessDaysInMonth(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

function countBusinessDaysElapsed(year: number, month: number, dayLimit: number): number {
  let count = 0;
  for (let day = 1; day <= dayLimit; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

function deriveOperationalInsights(data: DashboardPayload, year: number): OperationalInsights {
  const series = [...data.monthlySeries].sort((a, b) => a.month - b.month);
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const fallbackMonth =
    series[series.length - 1]?.month ?? (isCurrentYear ? now.getMonth() + 1 : 12);
  const currentMonth = isCurrentYear ? now.getMonth() + 1 : fallbackMonth;
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;

  const byMonth = new Map(series.map((entry) => [entry.month, entry]));
  const current = byMonth.get(currentMonth);
  const previous = byMonth.get(previousMonth);

  const currentItau = current?.cdb_itau ?? 0;
  const currentSantander = current?.cdb_other ?? 0;
  const currentFii = current?.fii_dividends ?? 0;

  const previousItau = previous?.cdb_itau ?? 0;
  const previousSantander = previous?.cdb_other ?? 0;
  const previousFii = previous?.fii_dividends ?? 0;

  const currentTotal = current?.total ?? 0;
  const recentAverageSource = series
    .filter((entry) => entry.month <= currentMonth)
    .slice(-3);
  const recentAverage =
    recentAverageSource.length > 0
      ? recentAverageSource.reduce((acc, entry) => acc + entry.total, 0) /
        recentAverageSource.length
      : 0;

  const totalBusinessDays = Math.max(1, countBusinessDaysInMonth(year, currentMonth));
  const elapsedBusinessDays = isCurrentYear
    ? Math.max(
        1,
        countBusinessDaysElapsed(
          year,
          currentMonth,
          Math.min(now.getDate(), new Date(year, currentMonth, 0).getDate()),
        ),
      )
    : totalBusinessDays;

  const expectedToDate =
    recentAverage > 0 ? recentAverage * (elapsedBusinessDays / totalBusinessDays) : 0;
  const projectedClose =
    elapsedBusinessDays > 0
      ? (currentTotal / elapsedBusinessDays) * totalBusinessDays
      : currentTotal;
  const pacePercent =
    expectedToDate > 0 ? (currentTotal / expectedToDate) * 100 : null;

  const targetAnnual = data.goalProgress.annualIncomeTarget;
  const ytd = data.kpis.ytdPassiveIncome;
  const monthsRemaining = isCurrentYear ? Math.max(1, 12 - currentMonth + 1) : 1;
  const remainingToTarget = Math.max(targetAnnual - ytd, 0);
  const requiredPerMonth = remainingToTarget / monthsRemaining;

  const driversBase: Array<{
    label: string;
    current: number;
    previous: number;
  }> = [
    { label: "CDB Itaú", current: currentItau, previous: previousItau },
    { label: "CDB Santander", current: currentSantander, previous: previousSantander },
    { label: "FIIs", current: currentFii, previous: previousFii },
  ];

  const drivers: DriverInsight[] = driversBase.map((driver) => {
    const delta = driver.current - driver.previous;
    const deltaPct =
      driver.previous > 0 ? (delta / driver.previous) * 100 : null;
    const sharePct = currentTotal > 0 ? (driver.current / currentTotal) * 100 : 0;
    return { ...driver, delta, deltaPct, sharePct };
  });

  const cdiReference =
    data.insights.cdiAnnualReference > 0 ? data.insights.cdiAnnualReference : 10.65;
  const cdbTotalCurrent = currentItau + currentSantander;
  const cdbImpactPer1pp = cdiReference > 0 ? cdbTotalCurrent / cdiReference : 0;

  const stressScenarios = [
    {
      label: `CDI -1pp (${cdiReference.toFixed(2)}% -> ${(cdiReference - 1).toFixed(2)}%)`,
      impact: -cdbImpactPer1pp,
      simulatedTotal: currentTotal - cdbImpactPer1pp,
    },
    {
      label: `CDI +1pp (${cdiReference.toFixed(2)}% -> ${(cdiReference + 1).toFixed(2)}%)`,
      impact: cdbImpactPer1pp,
      simulatedTotal: currentTotal + cdbImpactPer1pp,
    },
    {
      label: "FIIs -10%",
      impact: -(currentFii * 0.1),
      simulatedTotal: currentTotal - currentFii * 0.1,
    },
    {
      label: "FIIs -20%",
      impact: -(currentFii * 0.2),
      simulatedTotal: currentTotal - currentFii * 0.2,
    },
  ];

  const biggestNegativeDriver = [...drivers]
    .filter((driver) => driver.delta < 0)
    .sort((a, b) => a.delta - b.delta)[0];

  let priorityAction = "Ritmo saudável. Manter estratégia atual e monitorar fechamento do mês.";
  if (remainingToTarget <= 0) {
    priorityAction =
      "Meta anual já atingida. Priorize proteger consistência e evitar concentração excessiva.";
  } else if (biggestNegativeDriver) {
    priorityAction = `Prioridade do mês: recuperar ${biggestNegativeDriver.label}, que caiu ${formatCurrencyBRL(Math.abs(biggestNegativeDriver.delta))} vs mês anterior.`;
  } else if (requiredPerMonth > recentAverage && remainingToTarget > 0) {
    priorityAction = `Ritmo abaixo da meta anual: você precisa de ${formatCurrencyBRL(requiredPerMonth)}/mês, acima da média recente de ${formatCurrencyBRL(recentAverage)}.`;
  }

  return {
    currentMonth,
    currentTotal,
    expectedToDate,
    projectedClose,
    pacePercent,
    elapsedBusinessDays,
    totalBusinessDays,
    ytd,
    targetAnnual,
    remainingToTarget,
    monthsRemaining,
    requiredPerMonth,
    recentAverage,
    cdiReference,
    stressScenarios,
    drivers,
    priorityAction,
  };
}

export function InsightsPageClient({
  data,
  dailyInsights,
  marketSnapshot,
  professionalInsights,
  year,
}: Props) {
  const forecastSeries = buildForecastSeries(data);
  const distributionSeries = buildDistributionSeries(data);
  const operational = deriveOperationalInsights(data, year);
  const fiiSuggestion = data.insights.fiiReinvestment;
  const dailyReport = dailyInsights?.report ?? null;
  const cryptoQuotesByPair = new Map(
    (marketSnapshot?.cryptoQuotes ?? []).map((quote) => [quote.pair, quote]),
  );
  const cryptoCardsOrder: Array<"BTC-USD" | "ETH-USD" | "SOL-USD" | "XLM-USD"> = [
    "BTC-USD",
    "ETH-USD",
    "SOL-USD",
    "XLM-USD",
  ];
  const diagnosisHistorySeries = (professionalInsights?.diagnosisHistory ?? [])
    .slice()
    .reverse()
    .map((item) => ({
      date: shortDate(item.runDate),
      hitRate: item.hitRatePercent ?? 0,
      edge: item.cumulativeEdgeValue,
      risk: item.riskScore,
      headline: item.headline,
      regime: item.riskRegime,
    }));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="text-lg font-bold text-slate-50">Insights Financeiros Nível 3</h2>
        <p className="text-sm text-slate-400">
          Painel avançado com previsão, risco e direção da renda passiva ({year}).
        </p>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Snapshot de mercado (atual e D-1)
          </h3>
          <span className="text-[11px] text-slate-500">
            Atualizado em{" "}
            {marketSnapshot?.generatedAt
              ? new Date(marketSnapshot.generatedAt).toLocaleString("pt-BR")
              : "—"}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-700 p-3">
            <p className="text-[11px] text-slate-400">Selic atual</p>
            <p className="text-lg font-bold text-cyan-300">
              {marketSnapshot?.selicPercent !== null && marketSnapshot?.selicPercent !== undefined
                ? `${marketSnapshot.selicPercent.toFixed(2)}% a.a.`
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-slate-700 p-3">
            <p className="text-[11px] text-slate-400">CDI atual</p>
            <p className="text-lg font-bold text-emerald-300">
              {marketSnapshot?.cdiAnnualizedPercent !== null &&
              marketSnapshot?.cdiAnnualizedPercent !== undefined
                ? `${marketSnapshot.cdiAnnualizedPercent.toFixed(2)}% a.a.`
                : "—"}
            </p>
            <p className="text-[11px] text-slate-500">
              Diário:{" "}
              {marketSnapshot?.cdiDailyPercent !== null &&
              marketSnapshot?.cdiDailyPercent !== undefined
                ? `${marketSnapshot.cdiDailyPercent.toFixed(4)}%`
                : "—"}
            </p>
          </div>
          <div
            className={`rounded-md border p-3 ${marketCardTone(
              marketSnapshot?.ibovespaDayChangePercent ?? null,
            )}`}
          >
            <p className="text-[11px] text-slate-400">Ibovespa (fechamento D-1)</p>
            <p
              className={`text-lg font-bold ${marketValueTone(
                marketSnapshot?.ibovespaDayChangePercent ?? null,
              )}`}
            >
              {formatPoints(marketSnapshot?.ibovespaPreviousClose ?? null)}
            </p>
            <p
              className={`text-[11px] font-semibold ${dayVariationTone(
                marketSnapshot?.ibovespaDayChangePercent ?? null,
              )}`}
            >
              Dia: {signedDayVariation(marketSnapshot?.ibovespaDayChangePercent ?? null)}
            </p>
            <p className="text-[11px] text-slate-500">
              Data: {formatSnapshotDate(marketSnapshot?.ibovespaDate ?? null)}
            </p>
          </div>
          <div
            className={`rounded-md border p-3 ${marketCardTone(
              marketSnapshot?.ifixDayChangePercent ?? null,
            )}`}
          >
            <p className="text-[11px] text-slate-400">IFIX (fechamento D-1)</p>
            <p
              className={`text-lg font-bold ${marketValueTone(
                marketSnapshot?.ifixDayChangePercent ?? null,
              )}`}
            >
              {formatPoints(marketSnapshot?.ifixPreviousClose ?? null)}
            </p>
            <p
              className={`text-[11px] font-semibold ${dayVariationTone(
                marketSnapshot?.ifixDayChangePercent ?? null,
              )}`}
            >
              Dia: {signedDayVariation(marketSnapshot?.ifixDayChangePercent ?? null)}
            </p>
            <p className="text-[11px] text-slate-500">
              Data: {formatSnapshotDate(marketSnapshot?.ifixDate ?? null)}
            </p>
          </div>
        </div>
        {marketSnapshot?.warnings?.length ? (
          <p className="mt-3 text-xs text-amber-300">
            {marketSnapshot.warnings.join(" | ")}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Snapshot de cripto (USD, tempo real)
          </h3>
          <span className="text-[11px] text-slate-500">
            BTC, ETH, SOL e XLM
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cryptoCardsOrder.map((pair) => {
            const quote = cryptoQuotesByPair.get(pair);
            const symbol = pair.replace("-USD", "");
            return (
              <div
                key={pair}
                className={`rounded-md border p-3 ${marketCardTone(quote?.dayChangePercent ?? null)}`}
              >
                <p className="text-[11px] text-slate-400">{symbol}/USD</p>
                <p className={`text-lg font-bold ${marketValueTone(quote?.dayChangePercent ?? null)}`}>
                  {formatUsd(quote?.priceUsd ?? null)}
                </p>
                <p className={`text-[11px] font-semibold ${dayVariationTone(quote?.dayChangePercent ?? null)}`}>
                  Dia: {signedDayVariation(quote?.dayChangePercent ?? null)}
                </p>
                <p className="text-[11px] text-slate-500">
                  Data: {formatSnapshotDate(quote?.updatedAt ?? null)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {dailyReport ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <article className="rounded-xl border border-slate-700 bg-slate-800 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Agente Financeiro Diário (Nível 4)
              </h3>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${radarStyle(
                  dailyReport.radarStatus,
                )}`}
              >
                Radar {dailyReport.radarStatus}
              </span>
              <span className="text-[11px] text-slate-400">
                Confiança {formatPercentage(dailyReport.confidencePercent)}
              </span>
              <span className="text-[11px] text-slate-500">
                {dailyReport.generatedBy === "llm"
                  ? `LLM ${dailyReport.model ?? ""}`.trim()
                  : "Motor quantitativo"}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-100">{dailyReport.headline}</p>
            <p className="mt-1 text-xs text-slate-300">{dailyReport.summary}</p>
            <p className="mt-2 text-xs text-cyan-300">
              Prioridade do dia: <span className="font-semibold">{dailyReport.priorityAction}</span>
            </p>
            {dailyReport.goalContext ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${goalCardTone(
                    dailyReport.goalContext.monthlyIncomeProgressPercent,
                  )}`}
                >
                  <p className="text-slate-400">Meta mensal CDB</p>
                  <p className={`font-semibold ${goalProgressTone(dailyReport.goalContext.monthlyIncomeProgressPercent)}`}>
                    {dailyReport.goalContext.monthlyIncomeTarget !== null
                      ? `${formatCurrencyBRL(dailyReport.goalContext.monthlyIncomeRealized)} / ${formatCurrencyBRL(
                          dailyReport.goalContext.monthlyIncomeTarget,
                        )}`
                      : "Não configurada"}
                  </p>
                  <p className="text-slate-400">
                    {dailyReport.goalContext.monthlyIncomeTarget !== null
                      ? dailyReport.goalContext.monthlyIncomeGap !== null &&
                        dailyReport.goalContext.monthlyIncomeGap > 0
                        ? `Gap ${formatCurrencyBRL(dailyReport.goalContext.monthlyIncomeGap)}`
                        : "Meta atingida"
                      : "Defina meta em Metas"}
                  </p>
                </div>
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${goalCardTone(
                    dailyReport.goalContext.annualCapitalProgressPercent,
                  )}`}
                >
                  <p className="text-slate-400">Meta anual patrimônio</p>
                  <p className={`font-semibold ${goalProgressTone(dailyReport.goalContext.annualCapitalProgressPercent)}`}>
                    {dailyReport.goalContext.annualCapitalTarget !== null
                      ? `${formatCurrencyBRL(dailyReport.goalContext.annualCapitalCurrent)} / ${formatCurrencyBRL(
                          dailyReport.goalContext.annualCapitalTarget,
                        )}`
                      : "Não configurada"}
                  </p>
                  <p className="text-slate-400">
                    {dailyReport.goalContext.annualCapitalTarget !== null
                      ? dailyReport.goalContext.annualCapitalGap !== null &&
                        dailyReport.goalContext.annualCapitalGap > 0
                        ? `Gap ${formatCurrencyBRL(dailyReport.goalContext.annualCapitalGap)}`
                        : "Meta atingida"
                      : "Defina meta em Metas"}
                  </p>
                </div>
              </div>
            ) : null}
            {dailyInsights?.warnings?.length ? (
              <div className="mt-3 rounded-md border border-amber-700/60 bg-amber-950/30 p-2 text-[11px] text-amber-300">
                {dailyInsights.warnings.join(" | ")}
              </div>
            ) : null}
          </article>

          <article className="rounded-xl border border-slate-700 bg-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-100">Ações sugeridas (hoje)</h3>
            <div className="mt-3 space-y-2">
              {dailyReport.actions.slice(0, 3).map((action) => (
                <div key={action.id} className="rounded-md border border-slate-700 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100">{action.title}</p>
                    <span
                      className={`text-[11px] font-semibold ${priorityStyle(action.priority)}`}
                    >
                      {priorityLabel(action.priority)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">{action.rationale}</p>
                  <p className="mt-1 text-[11px] text-cyan-300">{action.expectedImpact}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {dailyReport ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Riscos monitorados</h3>
            <ul className="mt-3 space-y-2 text-xs">
              {dailyReport.risks.slice(0, 3).map((risk) => (
                <li key={risk.id} className="rounded-md border border-slate-700 p-2">
                  <p className="font-semibold text-slate-100">{risk.title}</p>
                  <p className="mt-1 text-slate-300">{risk.description}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Gatilho: {risk.trigger}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Evidências do diagnóstico</h3>
            <ul className="mt-3 space-y-2 text-xs">
              {dailyReport.evidence.slice(0, 5).map((item) => (
                <li key={item.id} className="rounded-md border border-slate-700 p-2">
                  <p className="text-slate-400">{item.label}</p>
                  <p className="font-semibold text-slate-100">{item.value}</p>
                  <p className="text-[11px] text-slate-500">{item.context}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Histórico diário recente</h3>
            <ul className="mt-3 space-y-2 text-xs">
              {(dailyInsights?.history ?? []).slice(0, 7).map((item) => (
                <li key={`${item.runDate}-${item.headline}`} className="rounded-md border border-slate-700 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">{item.runDate}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${radarStyle(
                        item.radarStatus,
                      )}`}
                    >
                      {item.radarStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-300">{item.headline}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      {professionalInsights ? (
        <section className="space-y-4 rounded-xl border border-cyan-900/70 bg-slate-900/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-cyan-200">
                Insights Financeiros Nível 5 (Analista)
              </h3>
              <p className="text-xs text-slate-400">
                Qualidade preditiva, probabilidade de metas, atribuição e governança de dados.
              </p>
            </div>
            <span className="text-[11px] text-slate-500">
              Atualizado em {new Date(professionalInsights.generatedAt).toLocaleString("pt-BR")}
            </span>
          </div>
          {professionalInsights.warnings.length > 0 ? (
            <div className="rounded-md border border-amber-700/60 bg-amber-950/30 p-2 text-[11px] text-amber-300">
              {professionalInsights.warnings.join(" | ")}
            </div>
          ) : null}
          {professionalInsights.diagnosticAlerts.length > 0 ? (
            <div className="grid gap-2 xl:grid-cols-3">
              {professionalInsights.diagnosticAlerts.map((alert) => (
                <article
                  key={alert.id}
                  className={`rounded-md border p-3 text-xs ${diagnosticAlertTone(alert.severity)}`}
                >
                  <p className="font-semibold">{alert.title}</p>
                  <p className="mt-1">{alert.message}</p>
                  <p className="mt-1 text-[11px] opacity-90">Trigger: {alert.trigger}</p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Qualidade da previsão</h4>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2">Série</th>
                      <th className="py-2">MAPE</th>
                      <th className="py-2">MAE</th>
                      <th className="py-2">Viés</th>
                      <th className="py-2">Direção</th>
                      <th className="py-2">Amostra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {professionalInsights.forecastQuality.metrics.map((metric) => (
                      <tr key={metric.key} className="border-t border-slate-700/70 text-slate-200">
                        <td className="py-2">{metric.label}</td>
                        <td className="py-2 text-cyan-300">
                          {metric.mapePercent === null ? "—" : formatPercentage(metric.mapePercent)}
                        </td>
                        <td className="py-2">{metric.maeValue === null ? "—" : formatCurrencyBRL(metric.maeValue)}</td>
                        <td
                          className={`py-2 font-semibold ${
                            metric.biasValue === null
                              ? "text-slate-400"
                              : metric.biasValue > 0
                                ? "text-emerald-300"
                                : metric.biasValue < 0
                                  ? "text-rose-300"
                                  : "text-slate-300"
                          }`}
                        >
                          {metric.biasValue === null ? "—" : signedCurrency(metric.biasValue)}
                        </td>
                        <td className="py-2 text-amber-300">
                          {metric.directionAccuracyPercent === null
                            ? "—"
                            : formatPercentage(metric.directionAccuracyPercent)}
                        </td>
                        <td className="py-2 text-slate-400">{metric.sampleSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Probabilidade de metas</h4>
              <div className="mt-3 grid gap-3">
                {[
                  professionalInsights.goalProbabilities.monthlyIncome,
                  professionalInsights.goalProbabilities.annualCapital,
                ].map((goal) => (
                  <div key={goal.label} className="rounded-md border border-slate-700 p-3 text-xs">
                    <p className="text-slate-400">{goal.label}</p>
                    <p className="mt-1 text-slate-100">
                      Realizado: <span className="font-semibold">{formatCurrencyBRL(goal.realizedValue)}</span>
                    </p>
                    <p className="text-slate-100">
                      Projeção: <span className="font-semibold text-cyan-300">{formatCurrencyBRL(goal.projectedValue)}</span>
                    </p>
                    <p className="text-slate-100">
                      Alvo:{" "}
                      <span className="font-semibold">
                        {goal.targetValue === null ? "Não configurado" : formatCurrencyBRL(goal.targetValue)}
                      </span>
                    </p>
                    <p
                      className={`mt-1 font-semibold ${
                        goal.probabilityPercent === null
                          ? "text-slate-400"
                          : goal.probabilityPercent >= 70
                            ? "text-emerald-300"
                            : goal.probabilityPercent >= 40
                              ? "text-amber-300"
                              : "text-rose-300"
                      }`}
                    >
                      Probabilidade:{" "}
                      {goal.probabilityPercent === null ? "—" : formatPercentage(goal.probabilityPercent)}
                    </p>
                    {goal.confidenceBand ? (
                      <p className="text-[11px] text-slate-500">
                        Faixa: {formatCurrencyBRL(goal.confidenceBand.pessimistic)} •{" "}
                        {formatCurrencyBRL(goal.confidenceBand.base)} •{" "}
                        {formatCurrencyBRL(goal.confidenceBand.optimistic)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4 xl:col-span-2">
              <h4 className="text-sm font-semibold text-slate-100">
                Benchmark profissional ({professionalInsights.benchmark.referenceMonthLabel})
              </h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-xs">
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Carteira M/M:{" "}
                  <span className="font-semibold text-cyan-300">
                    {signedPercentage(professionalInsights.benchmark.portfolioMomPercent)}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  CDI M/M:{" "}
                  <span className="font-semibold text-slate-100">
                    {signedPercentage(professionalInsights.benchmark.cdiMomPercent)}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  IFIX M/M:{" "}
                  <span className="font-semibold text-slate-100">
                    {signedPercentage(professionalInsights.benchmark.ifixMomPercent)}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Ibov M/M:{" "}
                  <span className="font-semibold text-slate-100">
                    {signedPercentage(professionalInsights.benchmark.ibovMomPercent)}
                  </span>
                </p>
                <p
                  className={`rounded-md border border-slate-700 px-2 py-1 ${
                    (professionalInsights.benchmark.excessVsCdiPercent ?? 0) >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  Excesso vs CDI:{" "}
                  <span className="font-semibold">
                    {signedPercentage(professionalInsights.benchmark.excessVsCdiPercent)}
                  </span>
                </p>
                <p
                  className={`rounded-md border border-slate-700 px-2 py-1 ${
                    (professionalInsights.benchmark.excessVsIfixPercent ?? 0) >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  Excesso vs IFIX:{" "}
                  <span className="font-semibold">
                    {signedPercentage(professionalInsights.benchmark.excessVsIfixPercent)}
                  </span>
                </p>
                <p
                  className={`rounded-md border border-slate-700 px-2 py-1 ${
                    (professionalInsights.benchmark.excessVsIbovPercent ?? 0) >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  Excesso vs Ibov:{" "}
                  <span className="font-semibold">
                    {signedPercentage(professionalInsights.benchmark.excessVsIbovPercent)}
                  </span>
                </p>
              </div>
              {professionalInsights.benchmark.warnings.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-amber-300">
                  {professionalInsights.benchmark.warnings.map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>• {warning}</li>
                  ))}
                </ul>
              ) : null}
            </article>

            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Radar de risco (renda passiva)</h4>
              <div className="mt-3 space-y-2 text-xs">
                <p>
                  Regime:{" "}
                  <span className={`font-semibold ${riskRegimeTone(professionalInsights.riskRadar.regime)}`}>
                    {professionalInsights.riskRadar.regime}
                  </span>
                </p>
                <p>
                  Score risco:{" "}
                  <span className="font-semibold text-cyan-300">
                    {professionalInsights.riskRadar.score.toFixed(1)}/100
                  </span>
                </p>
                <p>
                  Volatilidade 3M:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatPercentage(professionalInsights.riskRadar.volatility3mPercent)}
                  </span>
                </p>
                <p>
                  Volatilidade 6M:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatPercentage(professionalInsights.riskRadar.volatility6mPercent)}
                  </span>
                </p>
                <p>
                  Drawdown máx:{" "}
                  <span className="font-semibold text-rose-300">
                    {formatPercentage(professionalInsights.riskRadar.maxDrawdownPercent)}
                  </span>
                </p>
                <p>
                  Tendência/mês:{" "}
                  <span
                    className={`font-semibold ${
                      professionalInsights.riskRadar.trendPerMonthPercent >= 0
                        ? "text-emerald-300"
                        : "text-rose-300"
                    }`}
                  >
                    {signedPercentage(professionalInsights.riskRadar.trendPerMonthPercent)}
                  </span>
                </p>
              </div>
            </article>
          </div>

          <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h4 className="text-sm font-semibold text-slate-100">Motor de recomendação de aporte</h4>
            <p className="mt-1 text-xs text-cyan-300">{professionalInsights.recommendation.action}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
              <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                Janela avaliada:{" "}
                <span className="font-semibold text-slate-100">
                  {professionalInsights.recommendation.backtest.sampleSize} meses
                </span>
              </p>
              <p
                className={`rounded-md border border-slate-700 px-2 py-1 ${
                  (professionalInsights.recommendation.backtest.hitRatePercent ?? 0) >= 50
                    ? "text-emerald-300"
                    : "text-amber-300"
                }`}
              >
                Taxa de acerto:{" "}
                <span className="font-semibold">
                  {professionalInsights.recommendation.backtest.hitRatePercent === null
                    ? "—"
                    : formatPercentage(professionalInsights.recommendation.backtest.hitRatePercent)}
                </span>
              </p>
              <p
                className={`rounded-md border border-slate-700 px-2 py-1 ${
                  professionalInsights.recommendation.backtest.cumulativeEdgeValue >= 0
                    ? "text-emerald-300"
                    : "text-rose-300"
                }`}
              >
                Edge acumulado:{" "}
                <span className="font-semibold">
                  {signedCurrency(professionalInsights.recommendation.backtest.cumulativeEdgeValue)}
                </span>
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-2">Ativo</th>
                    <th className="py-2">Score</th>
                    <th className="py-2">Momentum</th>
                    <th className="py-2">Yield mensal</th>
                    <th className="py-2">Estabilidade</th>
                    <th className="py-2">Racional</th>
                  </tr>
                </thead>
                <tbody>
                  {professionalInsights.recommendation.items.map((item) => (
                    <tr key={item.key} className="border-t border-slate-700/70 text-slate-200">
                      <td className="py-2">
                        {item.label}
                        {item.key === professionalInsights.recommendation.bestAssetKey ? (
                          <span className="ml-2 rounded-full border border-emerald-600/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            Top
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 font-semibold text-cyan-300">{item.score.toFixed(1)}</td>
                      <td className="py-2">{signedPercentage(item.momentumPercent)}</td>
                      <td className="py-2">
                        {item.monthlyYieldPercent === null
                          ? "—"
                          : formatPercentage(item.monthlyYieldPercent)}
                      </td>
                      <td className="py-2 text-amber-300">{formatPercentage(item.stabilityPercent)}</td>
                      <td className="py-2 text-slate-400">{item.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {professionalInsights.recommendation.backtest.evaluations.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-xs font-semibold text-slate-300">
                  Backtest do motor (sinal M-1 → resultado em M)
                </p>
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2">Sinal</th>
                      <th className="py-2">Mês resultado</th>
                      <th className="py-2">Escolha</th>
                      <th className="py-2">Melhor real</th>
                      <th className="py-2">Acerto</th>
                      <th className="py-2">Edge R$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {professionalInsights.recommendation.backtest.evaluations
                      .slice(0, 6)
                      .map((row) => (
                        <tr
                          key={`${row.fromMonthLabel}-${row.toMonthLabel}-${row.predictedKey}`}
                          className="border-t border-slate-700/70 text-slate-200"
                        >
                          <td className="py-2">{row.fromMonthLabel}</td>
                          <td className="py-2">{row.toMonthLabel}</td>
                          <td className="py-2">{row.predictedLabel}</td>
                          <td className="py-2">{row.actualBestLabel}</td>
                          <td className={`py-2 font-semibold ${row.hit ? "text-emerald-300" : "text-rose-300"}`}>
                            {row.hit ? "Sim" : "Não"}
                          </td>
                          <td className={`py-2 font-semibold ${row.edgeValue >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {signedCurrency(row.edgeValue)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/40 p-3 text-xs">
              <p className="font-semibold text-slate-100">
                Leitura analítica do backtest: {professionalInsights.recommendation.backtest.diagnosis.headline}
              </p>
              <div className="mt-2 grid gap-2 xl:grid-cols-2">
                <div>
                  <p className="font-semibold text-emerald-300">Forças</p>
                  <ul className="mt-1 space-y-1 text-slate-300">
                    {professionalInsights.recommendation.backtest.diagnosis.strengths.map((item, idx) => (
                      <li key={`strength-${idx}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-rose-300">Falhas recorrentes</p>
                  <ul className="mt-1 space-y-1 text-slate-300">
                    {professionalInsights.recommendation.backtest.diagnosis.weaknesses.map((item, idx) => (
                      <li key={`weak-${idx}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-2 text-cyan-300">
                Próximo ajuste recomendado:{" "}
                <span className="font-semibold">
                  {professionalInsights.recommendation.backtest.diagnosis.nextAdjustment}
                </span>
              </p>
            </div>
          </article>

          <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h4 className="text-sm font-semibold text-slate-100">
              Evolução diária do diagnóstico (mês atual)
            </h4>
            <div className="mt-2 rounded-md border border-slate-700/70 bg-slate-900/40 p-3 text-[11px] text-slate-300">
              <p className="font-semibold text-slate-100">Como ler este painel</p>
              <div className="mt-2 grid gap-2 xl:grid-cols-2">
                <p>
                  <span className="font-semibold text-cyan-300">Hit rate (%):</span> taxa de acerto
                  dos diagnósticos recentes. Quanto maior, melhor.
                </p>
                <p>
                  <span className="font-semibold text-amber-300">Edge acumulado (R$):</span> saldo
                  financeiro acumulado das recomendações. Positivo = gerou valor.
                </p>
                <p>
                  <span className="font-semibold text-rose-300">Risk score (0-100):</span> nível de
                  estresse da carteira. 0-39 controlado, 40-69 atenção, 70-100 estressado.
                </p>
                <p>
                  <span className="font-semibold text-slate-200">Headline:</span> frase-resumo do dia
                  para orientar ação rápida.
                </p>
              </div>
            </div>
            {diagnosisHistorySeries.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">
                Sem histórico diário disponível para este mês.
              </p>
            ) : (
              <>
                <p className="mt-3 text-[11px] text-slate-400">
                  Eixo esquerdo: Hit rate (%). Eixo direito: Risk score (0-100). O Edge acumulado (R$)
                  aparece no tooltip e na tabela abaixo.
                </p>
                <div className="mt-3 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={diagnosisHistorySeries}
                      margin={{ top: 8, right: 18, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="#94a3b8" />
                      <YAxis
                        yAxisId="left"
                        stroke="#94a3b8"
                        width={64}
                        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#94a3b8"
                        width={56}
                        tickFormatter={(value) => `${Number(value).toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "#1f2937",
                          borderRadius: 8,
                        }}
                        labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                        formatter={(value: number | string, key: string) => {
                          const numeric = Number(value ?? 0);
                          if (key === "hitRate") return [`${numeric.toFixed(1)}%`, "Hit rate (%)"];
                          if (key === "risk") return [numeric.toFixed(1), "Risk score (0-100)"];
                          return [signedCurrency(numeric), "Edge acumulado (R$)"];
                        }}
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="hitRate"
                        name="Hit rate (%)"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="edge"
                        name="Edge acumulado (R$)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="risk"
                        name="Risk score (0-100)"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="py-2">Data</th>
                        <th className="py-2">Hit rate (%)</th>
                        <th className="py-2">Edge (R$)</th>
                        <th className="py-2">Risco (0-100)</th>
                        <th className="py-2">Headline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {professionalInsights.diagnosisHistory.slice(0, 7).map((item) => (
                        <tr
                          key={`${item.runDate}-${item.month}-${item.year}`}
                          className="border-t border-slate-700/70 text-slate-200"
                        >
                          <td className="py-2">{shortDate(item.runDate)}</td>
                          <td className="py-2 text-cyan-300">
                            {item.hitRatePercent === null ? "—" : formatPercentage(item.hitRatePercent)}
                          </td>
                          <td
                            className={`py-2 font-semibold ${
                              item.cumulativeEdgeValue >= 0 ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {signedCurrency(item.cumulativeEdgeValue)}
                          </td>
                          <td className={`py-2 ${riskRegimeTone(item.riskRegime)}`}>
                            {item.riskScore.toFixed(1)} ({item.riskRegime})
                          </td>
                          <td className="py-2 text-slate-400">{item.headline}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </article>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Atribuição do resultado M/M</h4>
              <p className="mt-1 text-[11px] text-slate-400">
                {professionalInsights.attribution.monthLabel}
                {professionalInsights.attribution.previousMonthLabel
                  ? ` vs ${professionalInsights.attribution.previousMonthLabel}`
                  : ""}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2">Tema</th>
                      <th className="py-2">Atual</th>
                      <th className="py-2">Anterior</th>
                      <th className="py-2">Δ R$</th>
                      <th className="py-2">Peso atual</th>
                      <th className="py-2">Contrib. Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {professionalInsights.attribution.items.map((item) => (
                      <tr key={item.key} className="border-t border-slate-700/70 text-slate-200">
                        <td className="py-2">{item.label}</td>
                        <td className="py-2">{formatCurrencyBRL(item.currentValue)}</td>
                        <td className="py-2">{formatCurrencyBRL(item.previousValue)}</td>
                        <td
                          className={`py-2 font-semibold ${
                            item.deltaValue > 0
                              ? "text-emerald-300"
                              : item.deltaValue < 0
                                ? "text-rose-300"
                                : "text-slate-300"
                          }`}
                        >
                          {signedCurrency(item.deltaValue)}
                        </td>
                        <td className="py-2 text-cyan-300">{formatPercentage(item.shareCurrentPercent)}</td>
                        <td className="py-2 text-amber-300">
                          {item.contributionToDeltaPercent === null
                            ? "—"
                            : formatPercentage(item.contributionToDeltaPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Total atual:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatCurrencyBRL(professionalInsights.attribution.totalCurrent)}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Total anterior:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatCurrencyBRL(professionalInsights.attribution.totalPrevious)}
                  </span>
                </p>
                <p
                  className={`rounded-md border border-slate-700 px-2 py-1 ${
                    professionalInsights.attribution.totalDelta >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  Δ total:{" "}
                  <span className="font-semibold">
                    {signedCurrency(professionalInsights.attribution.totalDelta)}
                  </span>
                </p>
              </div>
            </article>

            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Qualidade dos dados</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Nota:{" "}
                  <span className={`font-semibold ${qualityGradeTone(professionalInsights.dataQuality.grade)}`}>
                    {professionalInsights.dataQuality.grade}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Cobertura:{" "}
                  <span className="font-semibold text-cyan-300">
                    {formatPercentage(professionalInsights.dataQuality.completenessPercent)}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Meses com dado:{" "}
                  <span className="font-semibold text-slate-100">
                    {professionalInsights.dataQuality.monthsWithData}/
                    {professionalInsights.dataQuality.expectedMonths}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Último lançamento:{" "}
                  <span className="font-semibold text-slate-100">
                    {professionalInsights.dataQuality.latestEntryAt
                      ? new Date(professionalInsights.dataQuality.latestEntryAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Outliers:{" "}
                  <span className="font-semibold text-amber-300">
                    {professionalInsights.dataQuality.outlierCount}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Duplicidades:{" "}
                  <span className="font-semibold text-rose-300">
                    {professionalInsights.dataQuality.duplicateRows}
                  </span>
                </p>
              </div>
              {professionalInsights.dataQuality.warnings.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-amber-300">
                  {professionalInsights.dataQuality.warnings.map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>• {warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-emerald-300">Sem alertas de qualidade no período.</p>
              )}
            </article>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Previsão próximo mês</p>
          <p className="text-2xl font-extrabold text-cyan-300">
            {formatCurrencyBRL(data.insights.forecastNextMonth)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Faixa prevista</p>
          <p className="text-sm font-semibold text-slate-100">
            {formatCurrencyBRL(data.insights.forecastRangeMin)} a{" "}
            {formatCurrencyBRL(data.insights.forecastRangeMax)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Confiança</p>
          <p className="text-2xl font-extrabold text-emerald-300">
            {formatPercentage(data.insights.forecastConfidence)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Volatilidade recente</p>
          <p className="text-2xl font-extrabold text-amber-300">
            {formatPercentage(data.insights.volatilityPercent)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Drivers do mês ({monthLabel(operational.currentMonth)})
          </h3>
          <div className="mt-3 space-y-2 text-xs">
            {operational.drivers.map((driver) => (
              <div key={driver.label} className="rounded-md border border-slate-700 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{driver.label}</span>
                  <span className="font-semibold text-slate-100">
                    {formatCurrencyBRL(driver.current)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      driver.delta > 0
                        ? "text-emerald-300"
                        : driver.delta < 0
                          ? "text-rose-300"
                          : "text-slate-400"
                    }`}
                  >
                    {driver.delta >= 0 ? "+" : ""}
                    {formatCurrencyBRL(driver.delta)}{" "}
                    {driver.deltaPct !== null ? `(${formatPercentage(driver.deltaPct)})` : ""}
                  </span>
                  <span className="text-slate-400">
                    peso: {formatPercentage(driver.sharePct)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Ritmo do mês (dias úteis)</h3>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            <p>
              Realizado:{" "}
              <span className="font-semibold text-slate-100">
                {formatCurrencyBRL(operational.currentTotal)}
              </span>
            </p>
            <p>
              Esperado até hoje:{" "}
              <span className="font-semibold text-slate-100">
                {formatCurrencyBRL(operational.expectedToDate)}
              </span>
            </p>
            <p>
              Ritmo:{" "}
              <span
                className={`font-semibold ${
                  (operational.pacePercent ?? 0) >= 100
                    ? "text-emerald-300"
                    : "text-amber-300"
                }`}
              >
                {operational.pacePercent === null
                  ? "—"
                  : formatPercentage(operational.pacePercent)}
              </span>
            </p>
            <p>
              Projeção de fechamento:{" "}
              <span className="font-semibold text-cyan-300">
                {formatCurrencyBRL(operational.projectedClose)}
              </span>
            </p>
            <p className="text-slate-400">
              {operational.elapsedBusinessDays}/{operational.totalBusinessDays} dias úteis.
            </p>
          </div>
        </article>

        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Meta anual (run-rate)</h3>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            <p>
              Meta anual:{" "}
              <span className="font-semibold text-slate-100">
                {formatCurrencyBRL(operational.targetAnnual)}
              </span>
            </p>
            <p>
              Realizado YTD:{" "}
              <span className="font-semibold text-slate-100">
                {formatCurrencyBRL(operational.ytd)}
              </span>
            </p>
            <p>
              Gap anual:{" "}
              <span
                className={`font-semibold ${
                  operational.remainingToTarget > 0 ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {formatCurrencyBRL(operational.remainingToTarget)}
              </span>
            </p>
            <p>
              Necessário por mês ({operational.monthsRemaining} meses):{" "}
              <span className="font-semibold text-cyan-300">
                {formatCurrencyBRL(operational.requiredPerMonth)}
              </span>
            </p>
            <p>
              Média recente (3M):{" "}
              <span className="font-semibold text-slate-100">
                {formatCurrencyBRL(operational.recentAverage)}
              </span>
            </p>
          </div>
        </article>

        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Stress test rápido</h3>
          <p className="mt-1 text-[11px] text-slate-400">
            Base CDI: {operational.cdiReference.toFixed(2)}% a.a.
          </p>
          <ul className="mt-3 space-y-2 text-xs">
            {operational.stressScenarios.map((scenario) => (
              <li key={scenario.label} className="rounded-md border border-slate-700 p-2">
                <p className="text-slate-300">{scenario.label}</p>
                <p
                  className={`font-semibold ${
                    scenario.impact >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  Impacto: {scenario.impact >= 0 ? "+" : ""}
                  {formatCurrencyBRL(scenario.impact)}
                </p>
                <p className="text-slate-400">
                  Total simulado: {formatCurrencyBRL(scenario.simulatedTotal)}
                </p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-cyan-800 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Reinvestimento FIIs (Tijolo x Papel)
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            Tendência de mercado real (BCB) para o próximo ciclo mensal.
          </p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-orange-300">Tijolo</span>
              <span className="font-semibold text-orange-300">
                {formatPercentage(fiiSuggestion.tijoloPercent)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-700">
              <div
                className="h-2 rounded-full bg-orange-400"
                style={{ width: `${fiiSuggestion.tijoloPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-300">Papel</span>
              <span className="font-semibold text-emerald-300">
                {formatPercentage(fiiSuggestion.papelPercent)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-700">
              <div
                className="h-2 rounded-full bg-emerald-400"
                style={{ width: `${fiiSuggestion.papelPercent}%` }}
              />
            </div>
            <p className="text-slate-300">
              Regime:{" "}
              <span className="font-semibold text-cyan-300">
                {marketRegimeLabel(fiiSuggestion.marketRegime)}
              </span>
            </p>
            <p className="text-slate-400">
              Confiança:{" "}
              <span className="font-semibold text-slate-100">
                {formatPercentage(fiiSuggestion.confidencePercent)}
              </span>
            </p>
            <p className="text-slate-400">
              Juro real:{" "}
              <span className="font-semibold text-slate-100">
                {formatPercentage(fiiSuggestion.realRatePercent)}
              </span>
            </p>
            <p className="text-slate-500">
              Selic 3M {formatTrendPp(fiiSuggestion.selicTrend3mPercent)} | IPCA 3M{" "}
              {formatTrendPp(fiiSuggestion.ipcaTrend3mPercent)}
            </p>
            <p className="text-[11px] text-slate-500">{fiiSuggestion.rationale}</p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Ação prioritária do mês</h3>
          <p className="mt-2 text-sm text-slate-300">{operational.priorityAction}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Saúde de dados</h3>
          {data.alerts.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-300">
              Sem alertas críticos no período.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {data.alerts.map((alert) => (
                <li
                  key={alert.code}
                  className={
                    alert.severity === "critical"
                      ? "text-rose-300"
                      : alert.severity === "warning"
                        ? "text-amber-300"
                        : "text-slate-300"
                  }
                >
                  • {alert.message}
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Realizado vs previsão (mês seguinte)
          </h3>
          <p className="mb-4 text-xs text-slate-400">
            * último ponto representa a previsão do próximo mês.
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastSeries} margin={{ top: 8, right: 18, left: 22, bottom: 8 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis
                  stroke="#94a3b8"
                  tickFormatter={(value) => formatCurrencyBRL(Number(value))}
                  width={100}
                />
                <Tooltip
                  labelFormatter={(label) => `Mês: ${label}`}
                  formatter={(value: number | string) =>
                    formatCurrencyBRL(Number(value))
                  }
                  contentStyle={{
                    backgroundColor: "#020617",
                    borderColor: "#1f2937",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                  itemStyle={{ color: "#a5b4fc", fontWeight: 600 }}
                />
                <Legend />
                <Line
                  type="linear"
                  dataKey="realized"
                  name="Realizado"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  type="linear"
                  dataKey="forecastBridge"
                  name="Previsto (ponte)"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-100">
            Composição da renda no ano
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionSeries}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="source" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={formatCurrencyBRL} />
                <Tooltip
                  formatter={(value: number | string) =>
                    formatCurrencyBRL(Number(value))
                  }
                  contentStyle={{
                    backgroundColor: "#020617",
                    borderColor: "#1f2937",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                  itemStyle={{ color: "#818cf8", fontWeight: 600 }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <InsightsPanel
          kpis={data.kpis}
          insights={data.insights}
          goalProgress={data.goalProgress}
          alerts={data.alerts}
        />
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-100">Sinais acionáveis</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              Sazonalidade atual:{" "}
              <span className="font-semibold text-cyan-300">
                {data.insights.seasonalityFactor.toFixed(2)}x
              </span>
            </li>
            <li>
              Estado de anomalia:{" "}
              <span
                className={
                  data.insights.anomalyDetected
                    ? "font-semibold text-amber-300"
                    : "font-semibold text-emerald-300"
                }
              >
                {data.insights.anomalyDetected
                  ? `Detectada (${data.insights.anomalyReason})`
                  : "Sem anomalia relevante"}
              </span>
            </li>
            <li>
              Leitura rápida:
              <p className="mt-1 text-xs text-slate-400">{data.insights.commentary}</p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
