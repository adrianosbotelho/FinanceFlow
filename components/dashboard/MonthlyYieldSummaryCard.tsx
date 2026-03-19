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
          <article key={item.key} className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            <p className="text-sm font-semibold text-slate-100">{item.label}</p>
            <p className={`mt-2 text-2xl font-extrabold ${toneClass(item.monthlyYieldPct)}`}>
              {formatPercentage(item.monthlyYieldPct)}
            </p>
            <div className="mt-3 space-y-1 text-xs">
              <p className="text-slate-400">Rendimento no mês</p>
              <p className="font-semibold text-slate-200">{formatCurrencyBRL(item.monthlyIncome)}</p>
              <p className="text-slate-400">Base investida</p>
              <p className="font-semibold text-slate-200">{formatCurrencyBRL(item.investedAmount)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
