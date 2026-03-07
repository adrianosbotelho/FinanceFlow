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

// Ano anterior = tons quentes; ano atual = tons frios (fácil distinguir na análise)
const TYPE_CONFIG = [
  {
    key: "itau",
    label: "CDB Itaú",
    prevKey: "itauPrev",
    currKey: "itauCurr",
    colorPrev: "#ea580c",
    colorCurr: "#0ea5e9",
  },
  {
    key: "santander",
    label: "CDBs (demais)",
    prevKey: "santanderPrev",
    currKey: "santanderCurr",
    colorPrev: "#dc2626",
    colorCurr: "#8b5cf6",
  },
  {
    key: "fii",
    label: "FIIs",
    prevKey: "fiiPrev",
    currKey: "fiiCurr",
    colorPrev: "#16a34a",
    colorCurr: "#06b6d4",
  },
] as const;

interface Props {
  data: MonthComparisonPoint[];
  yearPrev: number;
  yearCurr: number;
}

function SingleTypeChart({
  data,
  yearPrev,
  yearCurr,
  config,
}: Props & { config: (typeof TYPE_CONFIG)[number] }) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-700 bg-slate-800/80 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">
        {config.label}
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
              dataKey={config.prevKey}
              name={`${yearPrev}`}
              stroke={config.colorPrev}
              strokeWidth={2}
              dot={{ r: 3, fill: config.colorPrev }}
              activeDot={{ r: 4 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={config.currKey}
              name={`${yearCurr}`}
              stroke={config.colorCurr}
              strokeWidth={2}
              dot={{ r: 3, fill: config.colorCurr }}
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
        {TYPE_CONFIG.map((config) => (
          <SingleTypeChart
            key={config.key}
            data={data}
            yearPrev={yearPrev}
            yearCurr={yearCurr}
            config={config}
          />
        ))}
      </div>
    </section>
  );
}
