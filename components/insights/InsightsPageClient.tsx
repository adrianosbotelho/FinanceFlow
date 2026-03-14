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
import { DashboardPayload } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { InsightsPanel } from "../dashboard/InsightsPanel";

interface Props {
  data: DashboardPayload;
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

export function InsightsPageClient({ data, year }: Props) {
  const forecastSeries = buildForecastSeries(data);
  const distributionSeries = buildDistributionSeries(data);
  const operational = deriveOperationalInsights(data, year);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="text-lg font-bold text-slate-50">Insights Financeiros Nível 3</h2>
        <p className="text-sm text-slate-400">
          Painel avançado com previsão, risco e direção da renda passiva ({year}).
        </p>
      </section>

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

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
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
