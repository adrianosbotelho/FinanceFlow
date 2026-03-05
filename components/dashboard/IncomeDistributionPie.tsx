"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { IncomeDistribution } from "../../types";
import { Card } from "../ui/Card";

interface Props {
  distribution: IncomeDistribution;
}

const COLORS = ["#6366F1", "#F97316", "#22C55E"];

export function IncomeDistributionPie({ distribution }: Props) {
  const data = [
    { name: "CDB Itaú", value: distribution.itauCdb },
    { name: "CDB Santander", value: distribution.santanderCdb },
    { name: "FIIs", value: distribution.fii },
  ];

  return (
    <Card className="h-72">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">
        Distribuição da Renda
      </h2>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) =>
              new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(value)
            }
            contentStyle={{
              backgroundColor: "#020617",
              borderColor: "#1f2937",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
