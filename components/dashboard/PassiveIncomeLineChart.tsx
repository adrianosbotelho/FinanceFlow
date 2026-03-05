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
      <div className="flex-1 bg-slate-900/50 p-6">
        <div className="relative h-64 w-full overflow-hidden rounded-lg border border-dashed border-slate-700 bg-slate-900/60">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/10 to-transparent" />
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={formatCurrencyBRL} />
              <Tooltip
                formatter={(value: number) => formatCurrencyBRL(value)}
                contentStyle={{
                  backgroundColor: "#020617",
                  borderColor: "#1f2937",
                }}
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
