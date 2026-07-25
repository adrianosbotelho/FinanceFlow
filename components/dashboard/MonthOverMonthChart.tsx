"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { MonthComparisonPoint } from "../../types";
import { formatCurrencyBRL } from "../../lib/formatters";

const PREV_COLORS = ["#ea580c", "#dc2626", "#ca8a04", "#7c3aed", "#0d9488"];
const CURR_COLORS = ["#0ea5e9", "#8b5cf6", "#facc15", "#f472b6", "#34d399"];

interface Props {
  data: MonthComparisonPoint[];
  yearPrev: number;
  yearCurr: number;
}

function SingleTypeChart({
  data,
  yearPrev,
  yearCurr,
  label,
  prevKey,
  currKey,
  colorPrev,
  colorCurr,
}: {
  data: Record<string, unknown>[];
  yearPrev: number;
  yearCurr: number;
  label: string;
  prevKey: string;
  currKey: string;
  colorPrev: string;
  colorCurr: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-700 bg-slate-800/80 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">
        {label}
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        {yearPrev} vs {yearCurr} — evolução mensal
      </p>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="monthName"
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              interval={0}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              tickFormatter={formatCurrencyBRL}
              width={52}
            />
            <Tooltip
              formatter={(value: number) => formatCurrencyBRL(value)}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "6px",
                fontSize: "11px",
              }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px" }}
              iconType="line"
              iconSize={10}
            />
            <Line
              type="monotone"
              dataKey={prevKey}
              name={`${yearPrev}`}
              stroke={colorPrev}
              strokeWidth={2}
              dot={{ r: 3, fill: colorPrev }}
              activeDot={{ r: 4 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={currKey}
              name={`${yearCurr}`}
              stroke={colorCurr}
              strokeWidth={2}
              dot={{ r: 3, fill: colorCurr }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MonthOverMonthChart({ data, yearPrev, yearCurr }: Props) {
  if (!data.length) return null;

  const cdbLabels = data[0].cdbItems.map((c) => c.label);

  const flatData = data.map((point) => {
    const row: Record<string, unknown> = { monthName: point.monthName };
    for (const cdb of point.cdbItems) {
      row[`${cdb.investment_id}_prev`] = cdb.prev;
      row[`${cdb.investment_id}_curr`] = cdb.curr;
    }
    row["fii_prev"] = point.fiiPrev;
    row["fii_curr"] = point.fiiCurr;
    return row;
  });

  const charts = [
    ...data[0].cdbItems.map((cdb, idx) => ({
      label: cdb.label,
      prevKey: `${cdb.investment_id}_prev`,
      currKey: `${cdb.investment_id}_curr`,
      colorPrev: PREV_COLORS[idx % PREV_COLORS.length],
      colorCurr: CURR_COLORS[idx % CURR_COLORS.length],
    })),
    {
      label: "FIIs",
      prevKey: "fii_prev",
      currKey: "fii_curr",
      colorPrev: "#16a34a",
      colorCurr: "#06b6d4",
    },
  ];

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="border-b border-slate-700 pb-4">
        <h2 className="text-lg font-bold text-slate-50">
          Mês a mês: tendência por tipo
        </h2>
        <p className="text-sm text-slate-500">
          Mesmo mês em anos diferentes — linhas mostram a evolução e facilitam ver
          se cada fonte está em alta ou em queda (ex.: CDB Itaú jan/{yearPrev} vs
          jan/{yearCurr}).
        </p>
      </div>
      <div className="grid gap-4 pt-4 sm:grid-cols-3">
        {charts.map((config) => (
          <SingleTypeChart
            key={config.label}
            data={flatData}
            yearPrev={yearPrev}
            yearCurr={yearCurr}
            label={config.label}
            prevKey={config.prevKey}
            currKey={config.currKey}
            colorPrev={config.colorPrev}
            colorCurr={config.colorCurr}
          />
        ))}
      </div>
    </section>
  );
}
