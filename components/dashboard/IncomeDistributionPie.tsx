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

interface Props {
  distribution: IncomeDistribution;
}

const COLORS = ["#F97316", "#EF4444", "#22C55E"];

export function IncomeDistributionPie({ distribution }: Props) {
  const data = [
    { name: "CDB Itaú", value: distribution.itauCdb },
    { name: "CDB Santander", value: distribution.otherCdb },
    { name: "FIIs", value: distribution.fii },
  ];

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="border-b border-slate-700 p-6">
        <h2 className="text-lg font-bold text-slate-50">
          Distribuição da renda
        </h2>
        <p className="text-sm text-slate-500">Por origem dos rendimentos</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="relative h-48 w-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                strokeWidth={2}
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
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                itemStyle={{ color: "#e2e8f0", fontWeight: 600 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-bold text-slate-50">100%</span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Alocação
            </span>
          </div>
        </div>
        <div className="w-full space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#F97316]" />
              <span>CDB Itaú</span>
            </div>
            <span className="font-bold">
              {formatPercent(distribution.itauCdb, distribution)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#EF4444]" />
              <span>CDB Santander</span>
            </div>
            <span className="font-bold">
              {formatPercent(distribution.otherCdb, distribution)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#22C55E]" />
              <span>Dividendos de FIIs</span>
            </div>
            <span className="font-bold">
              {formatPercent(distribution.fii, distribution)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatPercent(
  value: number,
  distribution: IncomeDistribution,
): string {
  const total =
    distribution.itauCdb + distribution.otherCdb + distribution.fii;
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(0)}%`;
}
