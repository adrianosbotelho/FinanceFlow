"use client";

import { DashboardPayload } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";

interface Props {
  summary: DashboardPayload["monthlyYieldSummary"];
}

function toneClass(value: number | null): string {
  if (value === null) return "text-slate-300";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-slate-200";
}

export function MonthlyYieldSummaryCard({ summary }: Props) {
  const monthRef =
    summary.month !== null ? `${monthLabel(summary.month)} ${summary.year}` : `Ano ${summary.year}`;
  let highlightedKey: Props["summary"]["items"][number]["key"] | null = null;
  let maxYield = Number.NEGATIVE_INFINITY;
  for (const item of summary.items) {
    if (item.monthlyYieldPct === null || Number.isNaN(item.monthlyYieldPct)) continue;
    if (item.monthlyYieldPct > maxYield) {
      maxYield = item.monthlyYieldPct;
      highlightedKey = item.key;
    }
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-50">Rentabilidade dos investimentos</h2>
          <p className="text-sm text-slate-400">
            Rendimento do mês atual em relação ao total investido de cada tema ({monthRef}).
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Rentabilidade mensal da carteira</p>
          <p className={`text-2xl font-extrabold ${toneClass(summary.portfolioMonthlyYieldPct)}`}>
            {formatPercentage(summary.portfolioMonthlyYieldPct)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {summary.items.map((item) => (
          <article
            key={item.key}
            className={`rounded-lg border p-4 ${
              highlightedKey === item.key
                ? "border-emerald-500/70 bg-emerald-950/20"
                : "border-slate-700 bg-slate-900/40"
            }`}
          >
            <p className="text-sm font-semibold text-slate-100">{item.label}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Realizado</p>
                <p className={`text-3xl font-extrabold ${toneClass(item.monthlyYieldPct)}`}>
                  {formatPercentage(item.monthlyYieldPct)}
                </p>
                <p className="text-xs text-slate-400">Rendimento no mês</p>
                <p className="text-lg font-semibold text-slate-200">
                  {formatCurrencyBRL(item.monthlyIncome)}
                </p>
                <p className="text-xs text-slate-400">Base investida</p>
                <p className="text-lg font-semibold text-slate-200">
                  {formatCurrencyBRL(item.investedAmount)}
                </p>
              </div>
              <div className="hidden h-full w-px bg-slate-700 md:block" />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Previsão</p>
                <p className={`text-3xl font-extrabold ${toneClass(item.forecastMonthlyYieldPct)}`}>
                  {formatPercentage(item.forecastMonthlyYieldPct)}
                </p>
                <p className="text-xs text-slate-400">Rendimento previsto</p>
                <p className="text-lg font-semibold text-slate-200">
                  {item.forecastMonthlyIncome === null
                    ? "—"
                    : formatCurrencyBRL(item.forecastMonthlyIncome)}
                </p>
                <p className="text-xs text-slate-400">Base investida</p>
                <p className="text-lg font-semibold text-slate-200">
                  {formatCurrencyBRL(item.investedAmount)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
