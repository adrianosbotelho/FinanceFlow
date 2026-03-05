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
import { Card } from "../ui/Card";

interface Props {
  data: PassiveIncomeByMonth[];
}

export function YoYLineChart({ data }: Props) {
  const chartData = data.map((m) => ({
    name: monthLabel(m.month),
    total: m.total,
  }));

  return (
    <Card className="h-72">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">
        Comparação Ano a Ano
      </h2>
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
            stroke="#F97316"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
