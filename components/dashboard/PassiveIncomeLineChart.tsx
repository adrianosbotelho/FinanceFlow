"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { PassiveIncomeByMonth } from "../../types";
import { formatCurrencyBRL, monthLabel } from "../../lib/formatters";

interface Props {
  data: PassiveIncomeByMonth[];
}

export function PassiveIncomeLineChart({ data }: Props) {
  const chartData = data.map((m) => ({
    name: monthLabel(m.month),
    total: m.total,
  }));

  const currentTotal =
    data.length > 0 ? data[data.length - 1]?.total ?? 0 : 0;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-700 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-50">
            Renda passiva total do mês
          </h2>
          <p className="text-sm text-slate-500">
            Soma de CDBs (Itaú e Santander) e dividendos de FIIs
          </p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-black text-accent">
            {formatCurrencyBRL(currentTotal)}
          </span>
        </div>
      </div>
      <div className="flex-1 p-4 md:p-6">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 20, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis
                stroke="#94a3b8"
                width={96}
                tick={{ fill: "#cbd5e1", fontSize: 13, fontWeight: 600 }}
                tickFormatter={(value: number) => formatCurrencyBRL(value)}
              />
              <Tooltip
                formatter={(value: number) => formatCurrencyBRL(value)}
                contentStyle={{
                  backgroundColor: "#020617",
                  borderColor: "#1f2937",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                itemStyle={{ color: "#e2e8f0", fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#6366F1"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
