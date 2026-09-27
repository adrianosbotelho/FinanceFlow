"use client";

import { useState } from "react";
import { PassiveIncomeByMonth } from "../../types";
import {
  formatCurrencyBRL,
  formatPercentage,
  monthLabel,
} from "../../lib/formatters";
import {
  countBusinessDaysElapsedInMonth,
  countBusinessDaysInMonth,
  previousBusinessDay,
} from "../../lib/business-days";

interface Props {
  data: PassiveIncomeByMonth[];
}

export const CDB_TEXT_COLORS = ["text-orange-300", "text-rose-300", "text-sky-300", "text-violet-300", "text-amber-300"];

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

function arrow(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "▲ ";
  if (value < 0) return "▼ ";
  return "• ";
}

function signedPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${formatPercentage(value)}`;
}

function signedCurrency(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatCurrencyBRL(Math.abs(value))}`;
}

// Mês em andamento: lançamentos são o acumulado até o dia útil anterior (D−1).
function countBusinessDaysElapsed(year: number, month: number): number {
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return countBusinessDaysInMonth(year, month);
  }
  if (year === now.getFullYear() && month === now.getMonth() + 1) {
    const dataDay = previousBusinessDay(now);
    if (dataDay.getMonth() + 1 !== month) return 0;
    return countBusinessDaysElapsedInMonth(year, month, dataDay.getDate());
  }
  return 0;
}

function buildDailyTooltip(value: number, year: number, month: number, inProgress: boolean): string {
  const days = inProgress ? countBusinessDaysElapsed(year, month) : countBusinessDaysInMonth(year, month);
  if (days <= 0) return formatCurrencyBRL(value);
  const label = inProgress ? `${days} dias úteis com dados` : `${days} dias úteis`;
  return `${formatCurrencyBRL(value)} ÷ ${label} = ${formatCurrencyBRL(value / days)}/dia útil`;
}

function ValueCell({
  value,
  year,
  month,
  inProgress,
  className,
  projected,
}: {
  value: number;
  year: number;
  month: number;
  inProgress: boolean;
  className: string;
  /** Mês em andamento: projeção de fechamento do investimento. */
  projected?: number;
}) {
  const [show, setShow] = useState(false);
  const showProjection = inProgress && projected !== undefined && projected > 0;
  if (value === 0 && !showProjection) {
    return <td className="whitespace-nowrap px-3 py-3 text-right text-slate-600">—</td>;
  }
  return (
    <td
      className={`${className} relative cursor-help whitespace-nowrap px-3 py-3 text-right tabular-nums`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {value === 0 ? <span className="text-slate-600">—</span> : formatCurrencyBRL(value)}
      {showProjection ? (
        <div className="mt-1 whitespace-nowrap text-[11px] font-normal text-slate-400">
          Projeção {formatCurrencyBRL(projected)}
        </div>
      ) : null}
      {show && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs font-normal text-slate-100 shadow-lg">
          {buildDailyTooltip(value, year, month, inProgress)}
        </div>
      )}
    </td>
  );
}

function SummaryChip({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${tone ?? "text-slate-100"}`}>{value}</p>
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function MonthlyTable({ data }: Props) {
  const cdbLabels = data.length > 0 ? data[0].cdb_items.map((c) => c.label) : [];
  const isInProgress = (m: PassiveIncomeByMonth) => m.projected_total !== undefined;
  const closed = data.filter((m) => !isInProgress(m));
  const maxTotal = Math.max(1, ...data.map((m) => Math.max(m.total, m.projected_total ?? 0)));

  const cdbTotals = cdbLabels.map((_, idx) => data.reduce((acc, m) => acc + (m.cdb_items[idx]?.income ?? 0), 0));
  const totalFiis = data.reduce((acc, m) => acc + m.fii_dividends, 0);
  const totalAll = data.reduce((acc, m) => acc + m.total, 0);
  const closedAverage = closed.length > 0 ? closed.reduce((acc, m) => acc + m.total, 0) / closed.length : null;
  const best = closed.reduce<PassiveIncomeByMonth | null>((acc, m) => (acc === null || m.total > acc.total ? m : acc), null);
  const worst = closed.reduce<PassiveIncomeByMonth | null>((acc, m) => (acc === null || m.total < acc.total ? m : acc), null);
  const firstClosed = closed[0] ?? null;
  const lastClosed = closed.length > 1 ? closed[closed.length - 1] : null;
  const periodGrowth =
    firstClosed && lastClosed && firstClosed.total > 0
      ? ((lastClosed.total - firstClosed.total) / firstClosed.total) * 100
      : null;
  const shortMonth = (m: PassiveIncomeByMonth) => `${monthLabel(m.month).toLowerCase()}/${String(m.year).slice(2)}`;

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

    const blob = new Blob(["﻿", csvBody], {
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
    <section className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-3 border-b border-slate-700 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-50">Desempenho histórico mensal</h2>
          <p className="text-sm text-slate-500">
            Renda passiva por mês e por investimento. Passe o mouse num valor para ver o ganho por dia útil.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 sm:self-auto"
        >
          <span className="text-sm">⬇</span>
          Exportar CSV
        </button>
      </div>

      {data.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <SummaryChip label="Total no período" value={formatCurrencyBRL(totalAll)} hint={`${data.length} meses`} />
          <SummaryChip
            label="Média mensal"
            value={closedAverage === null ? "—" : formatCurrencyBRL(closedAverage)}
            hint="meses fechados"
          />
          <SummaryChip
            label="Melhor mês"
            value={best ? formatCurrencyBRL(best.total) : "—"}
            hint={best ? shortMonth(best) : undefined}
            tone="text-emerald-300"
          />
          <SummaryChip
            label="Pior mês"
            value={worst ? formatCurrencyBRL(worst.total) : "—"}
            hint={worst ? shortMonth(worst) : undefined}
            tone="text-rose-300"
          />
          <SummaryChip
            label="Evolução"
            value={`${arrow(periodGrowth)}${signedPercent(periodGrowth)}`}
            hint={firstClosed && lastClosed ? `${shortMonth(firstClosed)} → ${shortMonth(lastClosed)}` : "meses fechados"}
            tone={toneClass(periodGrowth)}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400">
              <th className="whitespace-nowrap px-3 py-3 font-bold">Mês</th>
              <th className="whitespace-nowrap px-3 py-3 text-center font-bold">D.U.</th>
              {cdbLabels.map((label, idx) => (
                <th key={label} className={`px-3 py-3 text-right font-bold ${CDB_TEXT_COLORS[idx % CDB_TEXT_COLORS.length]}`}>
                  {label}
                </th>
              ))}
              <th className="px-3 py-3 text-right font-bold text-emerald-300">FIIs</th>
              <th className="min-w-[150px] px-3 py-3 text-right font-bold">Total</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-bold">Var. M/M</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-bold">Var. A/A</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/70">
            {data.map((m, index) => {
              const inProgress = isInProgress(m);
              const momValue = resolveMonthOverMonthValue(m.total, m.mom_growth);
              const previousTotal = index > 0 ? data[index - 1].total : null;
              const projectedMom =
                inProgress && previousTotal !== null && previousTotal > 0 && m.projected_total !== undefined
                  ? ((m.projected_total - previousTotal) / previousTotal) * 100
                  : null;
              const totalDays = countBusinessDaysInMonth(m.year, m.month);
              return (
                <tr
                  key={`${m.year}-${m.month}`}
                  className={`transition-colors hover:bg-slate-700/40 ${inProgress ? "bg-indigo-500/5" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-100">
                    {monthLabel(m.month)}/{m.year}
                    {inProgress ? (
                      <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                        em andamento
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center text-cyan-300 tabular-nums">
                    {inProgress ? `${countBusinessDaysElapsed(m.year, m.month)}/${totalDays}` : totalDays}
                  </td>
                  {m.cdb_items.map((cdb, idx) => (
                    <ValueCell
                      key={cdb.investment_id}
                      value={cdb.income}
                      year={m.year}
                      month={m.month}
                      inProgress={inProgress}
                      projected={cdb.projected}
                      className={`font-medium ${CDB_TEXT_COLORS[idx % CDB_TEXT_COLORS.length]}`}
                    />
                  ))}
                  <ValueCell
                    value={m.fii_dividends}
                    year={m.year}
                    month={m.month}
                    inProgress={inProgress}
                    projected={m.projected_fii}
                    className="font-medium text-emerald-300"
                  />
                  <td className="px-3 py-3 text-right">
                    <div className="whitespace-nowrap font-bold tabular-nums text-slate-50">{formatCurrencyBRL(m.total)}</div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-700/60">
                      <div
                        className={`ml-auto h-1.5 rounded-full ${inProgress ? "bg-indigo-400/60" : "bg-indigo-400"}`}
                        style={{ width: `${Math.min(100, (m.total / maxTotal) * 100)}%` }}
                      />
                    </div>
                    {inProgress && m.projected_total !== undefined ? (
                      <div className="mt-1 whitespace-nowrap text-[11px] text-slate-400">
                        Projeção {formatCurrencyBRL(m.projected_total)}
                      </div>
                    ) : null}
                  </td>
                  {inProgress ? (
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs">
                      <div className="text-slate-500">parcial</div>
                      <div className={`font-semibold ${toneClass(projectedMom)}`}>
                        Projeção {signedPercent(projectedMom)}
                      </div>
                    </td>
                  ) : (
                    <td className={`whitespace-nowrap px-3 py-3 text-right ${toneClass(m.mom_growth ?? null)}`}>
                      <div className="font-semibold">
                        {arrow(m.mom_growth ?? null)}
                        {signedPercent(m.mom_growth ?? null)}
                      </div>
                      {momValue !== null ? <div className="text-[11px] opacity-80">{signedCurrency(momValue)}</div> : null}
                    </td>
                  )}
                  <td className={`whitespace-nowrap px-3 py-3 text-right ${inProgress ? "text-slate-500" : toneClass(m.yoy_growth ?? null)}`}>
                    {inProgress ? "—" : signedPercent(m.yoy_growth ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600 bg-slate-900/50 font-bold">
              <td className="px-3 py-3 text-xs uppercase tracking-wider text-slate-300">Total</td>
              <td className="px-3 py-3 text-center text-slate-500">—</td>
              {cdbTotals.map((total, idx) => (
                <td
                  key={cdbLabels[idx]}
                  className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${CDB_TEXT_COLORS[idx % CDB_TEXT_COLORS.length]}`}
                >
                  {formatCurrencyBRL(total)}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-emerald-300">
                {formatCurrencyBRL(totalFiis)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-50">
                {formatCurrencyBRL(totalAll)}
              </td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Mês em andamento: valores acumulados até o dia útil anterior (D.U. com dados / total); a variação usa a projeção de
        fechamento. Médias, melhor/pior mês e evolução consideram só meses fechados. O valor líquido de IR está na página
        Performance.
      </p>
    </section>
  );
}
