"use client";

import {
  BarChart,
  Bar,
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

export function MonthlyBarChart({ data }: Props) {
  const chartData = data.map((m) => ({
    name: monthLabel(m.month),
    total: m.total,
  }));

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="border-b border-slate-700 p-6">
        <h2 className="text-lg font-bold text-slate-50">
          Comparação Mensal Histórica
        </h2>
        <p className="text-sm text-slate-500">
          Comparativo da renda passiva ao longo dos meses
        </p>
      </div>
      <div className="flex-1 p-6">
        <div className="h-64 w-full border-b border-slate-700 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
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
              <Bar dataKey="total" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
