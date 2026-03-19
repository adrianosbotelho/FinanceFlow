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
} from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { InsightsPanel } from "../dashboard/InsightsPanel";

interface Props {
  data: DashboardPayload;
  dailyInsights: DailyInsightApiPayload | null;
  marketSnapshot: MarketSnapshotPayload | null;
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

export function InsightsPageClient({ data, dailyInsights, marketSnapshot, year }: Props) {
  const forecastSeries = buildForecastSeries(data);
  const distributionSeries = buildDistributionSeries(data);
  const operational = deriveOperationalInsights(data, year);
  const fiiSuggestion = data.insights.fiiReinvestment;
  const dailyReport = dailyInsights?.report ?? null;

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
          <div className="rounded-md border border-slate-700 p-3">
            <p className="text-[11px] text-slate-400">Ibovespa (fechamento D-1)</p>
            <p className="text-lg font-bold text-slate-100">
              {formatPoints(marketSnapshot?.ibovespaPreviousClose ?? null)}
            </p>
            <p className="text-[11px] text-slate-500">
              Data: {formatSnapshotDate(marketSnapshot?.ibovespaDate ?? null)}
            </p>
          </div>
          <div className="rounded-md border border-slate-700 p-3">
            <p className="text-[11px] text-slate-400">IFIX (fechamento D-1)</p>
            <p className="text-lg font-bold text-slate-100">
              {formatPoints(marketSnapshot?.ifixPreviousClose ?? null)}
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
