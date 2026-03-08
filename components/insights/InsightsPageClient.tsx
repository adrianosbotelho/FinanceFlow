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
    forecast: number | null;
  }> = data.monthlySeries.map((m) => ({
    label: monthLabel(m.month),
    realized: m.total,
    forecast: null as number | null,
  }));

  const lastMonth = data.monthlySeries[data.monthlySeries.length - 1]?.month ?? 12;
  const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
  realized.push({
    label: `${monthLabel(nextMonth)}*`,
    realized: null,
    forecast: data.insights.forecastNextMonth,
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

export function InsightsPageClient({ data, year }: Props) {
  const forecastSeries = buildForecastSeries(data);
  const distributionSeries = buildDistributionSeries(data);

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
              <LineChart data={forecastSeries}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={formatCurrencyBRL} />
                <Tooltip formatter={(value: number) => formatCurrencyBRL(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="realized"
                  name="Realizado"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Previsto"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3 }}
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
                <Tooltip formatter={(value: number) => formatCurrencyBRL(value)} />
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
