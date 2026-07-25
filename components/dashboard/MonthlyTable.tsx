"use client";

import { PassiveIncomeByMonth } from "../../types";
import {
  formatCurrencyBRL,
  formatPercentage,
  monthLabel,
} from "../../lib/formatters";

interface Props {
  data: PassiveIncomeByMonth[];
}

function resolveMonthOverMonthValue(total: number, momGrowth?: number | null): number | null {
  if (momGrowth === null || momGrowth === undefined) return null;
  const growthFactor = 1 + momGrowth / 100;
  if (growthFactor <= 0) return null;
  const previousTotal = total / growthFactor;
  return total - previousTotal;
}

function toneClass(value: number | null): string {
  if (value === null) return "text-slate-400";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-slate-200";
}

const CDB_COLORS = ["text-orange-300", "text-rose-300", "text-sky-300", "text-violet-300", "text-amber-300"];

export function MonthlyTable({ data }: Props) {
  const cdbLabels = data.length > 0
    ? data[0].cdb_items.map((c) => c.label)
    : [];

  const summary = data.reduce(
    (acc, m) => {
      const momValue = resolveMonthOverMonthValue(m.total, m.mom_growth);
      for (let i = 0; i < m.cdb_items.length; i++) {
        if (!acc.cdbTotals[i]) acc.cdbTotals[i] = 0;
        acc.cdbTotals[i] += m.cdb_items[i].income;
      }
      acc.totalFiis += m.fii_dividends;
      acc.totalMonthly += m.total;
      if (momValue !== null) {
        acc.totalMomValue += momValue;
      }
      if (m.mom_growth !== null && m.mom_growth !== undefined) {
        acc.sumMomPercent += m.mom_growth;
        acc.countMomPercent += 1;
      }
      if (m.yoy_growth !== null && m.yoy_growth !== undefined) {
        acc.sumYoyPercent += m.yoy_growth;
        acc.countYoyPercent += 1;
      }
      return acc;
    },
    {
      cdbTotals: [] as number[],
      totalFiis: 0,
      totalMonthly: 0,
      totalMomValue: 0,
      sumMomPercent: 0,
      countMomPercent: 0,
      sumYoyPercent: 0,
      countYoyPercent: 0,
    },
  );
  const avgMomPercent =
    summary.countMomPercent > 0 ? summary.sumMomPercent / summary.countMomPercent : null;
  const avgYoyPercent =
    summary.countYoyPercent > 0 ? summary.sumYoyPercent / summary.countYoyPercent : null;

  const handleExportCsv = () => {
    const header = [
      "mes",
      "ano",
      ...cdbLabels.map((l) => l.toLowerCase().replace(/\s+/g, "_")),
      "fii_dividendos",
      "total_mensal",
      "var_mom_percent",
      "var_mom_valor",
      "var_yoy_percent",
    ];

    const rows = data.map((m) => {
      const momValue = resolveMonthOverMonthValue(m.total, m.mom_growth);
      return [
        String(m.month),
        String(m.year),
        ...m.cdb_items.map((c) => c.income.toFixed(2)),
        m.fii_dividends.toFixed(2),
        m.total.toFixed(2),
        m.mom_growth === null || m.mom_growth === undefined
          ? ""
          : m.mom_growth.toFixed(2),
        momValue === null ? "" : momValue.toFixed(2),
        m.yoy_growth === null || m.yoy_growth === undefined
          ? ""
          : m.yoy_growth.toFixed(2),
      ];
    });

    const csvBody = [header, ...rows]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF", csvBody], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `financeflow-historico-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between border-b border-slate-700 p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-50">
            Desempenho histórico mensal
          </h2>
          <p className="text-sm text-slate-500">
            Detalhamento da renda passiva por mês
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
        >
          <span className="text-sm">⬇</span>
          Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs md:text-sm">
          <thead>
            <tr className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
              <th className="px-6 py-4 font-bold">Mês</th>
              {cdbLabels.map((label, idx) => (
                <th key={label} className={`px-6 py-4 font-bold ${CDB_COLORS[idx % CDB_COLORS.length]}`}>
                  {label}
                </th>
              ))}
              <th className="px-6 py-4 font-bold text-emerald-300">Dividendos FIIs</th>
              <th className="px-6 py-4 font-bold">Total mensal</th>
              <th className="px-6 py-4 font-bold">Var (M/M)</th>
              <th className="px-6 py-4 font-bold">Var (M/M R$)</th>
              <th className="px-6 py-4 font-bold">Var (A/A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700 text-sm">
            {data.map((m) => {
              const momValue = resolveMonthOverMonthValue(m.total, m.mom_growth);
              return (
                <tr
                  key={`${m.year}-${m.month}`}
                  className="transition-colors hover:bg-slate-700/50"
                >
                  <td className="px-6 py-4 font-medium text-slate-100">
                    {monthLabel(m.month)} {m.year}
                  </td>
                  {m.cdb_items.map((cdb, idx) => (
                    <td key={cdb.investment_id} className={`px-6 py-4 font-medium ${CDB_COLORS[idx % CDB_COLORS.length]}`}>
                      {formatCurrencyBRL(cdb.income)}
                    </td>
                  ))}
                  <td className="px-6 py-4 font-medium text-emerald-300">
                    {formatCurrencyBRL(m.fii_dividends)}
                  </td>
                  <td className="px-6 py-4 font-bold">
                    {formatCurrencyBRL(m.total)}
                  </td>
                  <td className={`px-6 py-4 font-medium ${toneClass(m.mom_growth ?? null)}`}>
                    {formatPercentage(m.mom_growth ?? null)}
                  </td>
                  <td className={`px-6 py-4 font-medium ${toneClass(momValue)}`}>
                    {momValue === null ? "—" : formatCurrencyBRL(momValue)}
                  </td>
                  <td className={`px-6 py-4 font-medium ${toneClass(m.yoy_growth ?? null)}`}>
                    {formatPercentage(m.yoy_growth ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600 bg-slate-900/50">
              <td className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-300">
                Resumo
              </td>
              {summary.cdbTotals.map((total, idx) => (
                <td key={idx} className={`px-6 py-4 font-bold ${CDB_COLORS[idx % CDB_COLORS.length]}`}>
                  {formatCurrencyBRL(total)}
                </td>
              ))}
              <td className="px-6 py-4 font-bold text-emerald-300">
                {formatCurrencyBRL(summary.totalFiis)}
              </td>
              <td className="px-6 py-4 font-extrabold text-slate-100">
                {formatCurrencyBRL(summary.totalMonthly)}
              </td>
              <td className={`px-6 py-4 font-bold ${toneClass(avgMomPercent)}`}>
                {avgMomPercent === null ? "—" : `Média ${formatPercentage(avgMomPercent)}`}
              </td>
              <td className={`px-6 py-4 font-bold ${toneClass(summary.totalMomValue)}`}>
                {formatCurrencyBRL(summary.totalMomValue)}
              </td>
              <td className={`px-6 py-4 font-bold ${toneClass(avgYoyPercent)}`}>
                {avgYoyPercent === null ? "—" : `Média ${formatPercentage(avgYoyPercent)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
