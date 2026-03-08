"use client";

import {
  BarChart,
  Bar,
  Cell,
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

const MONTH_COLORS = [
  "#F97316", // Jan
  "#EF4444", // Fev
  "#EAB308", // Mar
  "#22C55E", // Abr
  "#06B6D4", // Mai
  "#3B82F6", // Jun
  "#6366F1", // Jul
  "#8B5CF6", // Ago
  "#EC4899", // Set
  "#14B8A6", // Out
  "#84CC16", // Nov
  "#F59E0B", // Dez
];

export function MonthlyBarChart({ data }: Props) {
  const chartData = data.map((m) => ({
    name: monthLabel(m.month),
    total: m.total,
    month: m.month,
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
              <YAxis
                stroke="#94a3b8"
                width={98}
                tick={{ fill: "#cbd5e1", fontSize: 13, fontWeight: 600 }}
                tickFormatter={(value: number) => formatCurrencyBRL(value)}
              />
              <Tooltip
                formatter={(value: number) => formatCurrencyBRL(value)}
                labelFormatter={(label) => `Mês: ${label}`}
                contentStyle={{
                  backgroundColor: "#020617",
                  borderColor: "#1f2937",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                itemStyle={{ color: "#e2e8f0", fontWeight: 600 }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`bar-month-${entry.month}`}
                    fill={MONTH_COLORS[index % MONTH_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
