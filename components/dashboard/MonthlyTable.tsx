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

export function MonthlyTable({ data }: Props) {
  const handleExportCsv = () => {
    const header = [
      "mes",
      "ano",
      "cdb_itau",
      "cdb_outros",
      "fii_dividendos",
      "total_mensal",
      "var_mom_percent",
      "var_yoy_percent",
    ];

    const rows = data.map((m) => [
      String(m.month),
      String(m.year),
      m.cdb_itau.toFixed(2),
      m.cdb_other.toFixed(2),
      m.fii_dividends.toFixed(2),
      m.total.toFixed(2),
      m.mom_growth === null || m.mom_growth === undefined
        ? ""
        : m.mom_growth.toFixed(2),
      m.yoy_growth === null || m.yoy_growth === undefined
        ? ""
        : m.yoy_growth.toFixed(2),
    ]);

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
              <th className="px-6 py-4 font-bold">CDB Itaú</th>
              <th className="px-6 py-4 font-bold">CDB Santander</th>
              <th className="px-6 py-4 font-bold">Dividendos FIIs</th>
              <th className="px-6 py-4 font-bold">Total mensal</th>
              <th className="px-6 py-4 font-bold">Var (M/M)</th>
              <th className="px-6 py-4 font-bold">Var (A/A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700 text-sm">
            {data.map((m) => (
              <tr
                key={`${m.year}-${m.month}`}
                className="transition-colors hover:bg-slate-700/50"
              >
                <td className="px-6 py-4 font-medium text-slate-100">
                  {monthLabel(m.month)} {m.year}
                </td>
                <td className="px-6 py-4">
                  {formatCurrencyBRL(m.cdb_itau)}
                </td>
                <td className="px-6 py-4">
                  {formatCurrencyBRL(m.cdb_other)}
                </td>
                <td className="px-6 py-4">
                  {formatCurrencyBRL(m.fii_dividends)}
                </td>
                <td className="px-6 py-4 font-bold">
                  {formatCurrencyBRL(m.total)}
                </td>
                <td className="px-6 py-4 text-success font-medium">
                  {formatPercentage(m.mom_growth ?? null)}
                </td>
                <td className="px-6 py-4 text-success font-medium">
                  {formatPercentage(m.yoy_growth ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
