"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DailyIncomePayload, DailyIncomePoint } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { CDB_TEXT_COLORS } from "./MonthlyTable";

interface Props {
  data: DailyIncomePayload | null;
  /** Ordem dos CDBs na tabela histórica, para manter as mesmas cores. */
  cdbLabels: string[];
}

type Mode = "daily" | "per10k";

// Equivalentes em hex das cores de CDB_TEXT_COLORS (orange/rose/sky/violet/amber-300).
const CDB_STROKES = ["#fdba74", "#fda4af", "#7dd3fc", "#c4b5fd", "#fcd34d"];

function toneClass(value: number | null): string {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-slate-400";
}

function signedPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "▲ +" : value < 0 ? "▼ " : "• "}${formatPercentage(value)}`;
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function DailyIncomeCard({ data, cdbLabels }: Props) {
  const [mode, setMode] = useState<Mode>("daily");

  if (!data) {
    return (
      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="text-lg font-bold text-slate-50">Ganho por dia útil</h2>
        <p className="mt-2 text-sm text-rose-400">Não foi possível carregar o ganho por dia útil.</p>
      </section>
    );
  }

  const colorIndex = (label: string, fallback: number) => {
    const idx = cdbLabels.indexOf(label);
    return (idx >= 0 ? idx : fallback) % CDB_STROKES.length;
  };
  const valueOf = (point: DailyIncomePoint | null) =>
    point === null ? null : mode === "daily" ? point.dailyIncome : point.dailyPer10k;
  const changeOf = (point: DailyIncomePoint | null) =>
    point === null ? null : mode === "daily" ? point.changePercent : point.changePer10kPercent;
  const inProgressMonth = data.total.find((item) => item?.status === "in_progress")?.month ?? null;

  const chartData = data.months.map((month, index) => {
    const row: Record<string, number | string | null> = {
      name: `${monthLabel(month)}${month === inProgressMonth ? "*" : ""}`,
    };
    for (const item of data.series) row[item.investmentId] = valueOf(item.points[index]);
    return row;
  });

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-3 border-b border-slate-700 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-50">Ganho por dia útil — {data.year}</h2>
          <p className="text-sm text-slate-500">
            {mode === "daily"
              ? "Renda de cada CDB no mês ÷ dias úteis em que ele rendeu."
              : "Ganho por dia útil a cada R$ 10 mil aplicados: mostra a taxa, sem o efeito dos aportes."}
          </p>
        </div>
        <div className="inline-flex self-start rounded-lg border border-slate-700 bg-slate-900 p-1 text-xs font-semibold sm:self-auto">
          <button
            type="button"
            onClick={() => setMode("daily")}
            className={`rounded-md px-3 py-1.5 ${mode === "daily" ? "bg-indigo-500 text-white" : "text-slate-300 hover:text-white"}`}
          >
            R$ por dia útil
          </button>
          <button
            type="button"
            onClick={() => setMode("per10k")}
            className={`rounded-md px-3 py-1.5 ${mode === "per10k" ? "bg-indigo-500 text-white" : "text-slate-300 hover:text-white"}`}
          >
            Por R$ 10 mil
          </button>
        </div>
      </div>

      {data.series.length === 0 ? (
        <p className="text-sm text-slate-400">Sem CDBs com renda lançada em {data.year}.</p>
      ) : (
        <>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis
                  stroke="#94a3b8"
                  width={84}
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  tickFormatter={(value: number) => formatCurrencyBRL(value)}
                />
                <Tooltip
                  formatter={(value: number) => `${formatCurrencyBRL(value)}/dia útil`}
                  contentStyle={{ backgroundColor: "#020617", borderColor: "#1f2937", borderRadius: 8 }}
                  labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {data.series.map((item, idx) => (
                  <Line
                    key={item.investmentId}
                    type="monotone"
                    dataKey={item.investmentId}
                    name={item.label}
                    stroke={CDB_STROKES[colorIndex(item.label, idx)]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-3 font-bold">Investimento</th>
                  {data.months.map((month) => (
                    <th key={month} className="whitespace-nowrap px-3 py-3 text-right font-bold">
                      {monthLabel(month)}
                      {month === inProgressMonth ? "*" : ""}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-3 text-right font-bold">No ano</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {data.series.map((item, idx) => {
                  const yearChange = mode === "daily" ? item.yearChangePercent : item.yearChangePer10kPercent;
                  return (
                    <tr key={item.investmentId} className="hover:bg-slate-700/40">
                      <td className={`whitespace-nowrap px-3 py-3 font-semibold ${CDB_TEXT_COLORS[colorIndex(item.label, idx)]}`}>
                        {item.label}
                      </td>
                      {item.points.map((point, index) => {
                        const value = valueOf(point);
                        const change = changeOf(point);
                        return (
                          <td
                            key={data.months[index]}
                            className="whitespace-nowrap px-3 py-3 text-right"
                            title={
                              point
                                ? `${formatCurrencyBRL(point.income)} ÷ ${point.businessDays} dias úteis${
                                    point.partialDebut ? " (estreia: dias úteis do mês inteiro)" : ""
                                  }`
                                : undefined
                            }
                          >
                            {value === null ? (
                              <span className="text-slate-600">—</span>
                            ) : (
                              <>
                                <div
                                  className={`font-medium tabular-nums ${
                                    point?.status === "in_progress" || point?.partialDebut ? "text-slate-400" : "text-slate-100"
                                  }`}
                                >
                                  {formatCurrencyBRL(value)}
                                </div>
                                <div className={`text-[11px] ${toneClass(change)}`}>
                                  {point?.partialDebut ? <span className="text-slate-500">estreia</span> : signedPercent(change)}
                                </div>
                              </>
                            )}
                          </td>
                        );
                      })}
                      <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold ${toneClass(yearChange)}`}>
                        {signedPercent(yearChange)}
                        {item.fromMonth && item.toMonth ? (
                          <div className="text-[11px] font-normal text-slate-500">
                            {monthLabel(item.fromMonth).toLowerCase()} → {monthLabel(item.toMonth).toLowerCase()}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600 bg-slate-900/50 font-bold">
                  <td className="px-3 py-3 text-xs uppercase tracking-wider text-slate-300">
                    {mode === "daily" ? "Carteira" : "Carteira (média)"}
                  </td>
                  {data.total.map((item, index) => {
                    const value = item === null ? null : mode === "daily" ? item.dailyIncome : item.dailyPer10k;
                    return (
                      <td key={data.months[index]} className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-50">
                        {value === null ? "—" : formatCurrencyBRL(value)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            * Mês em andamento: só os dias úteis com dados (até {formatDateBR(data.dataThroughISO)}). Mês de estreia conta os
            dias úteis a partir da data de início do cadastro; sem ela, fica marcado como &quot;estreia&quot; e fora das
            variações. &quot;Por R$ 10 mil&quot; divide pelo capital que rendeu no mês (saldo de abertura + metade dos aportes
            e resgates). FIIs ficam de fora: dividendos são mensais, não diários.
          </p>
        </>
      )}
    </section>
  );
}
