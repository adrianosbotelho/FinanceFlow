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
import { Card } from "../ui/Card";

interface Props {
  data: PassiveIncomeByMonth[];
}

export function MonthlyBarChart({ data }: Props) {
  const chartData = data.map((m) => ({
    name: monthLabel(m.month),
    total: m.total,
  }));

  return (
    <Card className="h-72">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">
        Comparação Mensal
      </h2>
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
          <Bar dataKey="total" fill="#22C55E" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
