"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Investment,
  PerformanceMonthPoint,
  PerformancePayload,
} from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  initialYear: number;
}

export function PerformancePageClient({ initialYear }: Props) {
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [investmentId, setInvestmentId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [marketValue, setMarketValue] = useState("");
  const [taxesPaid, setTaxesPaid] = useState("");
  const [feesPaid, setFeesPaid] = useState("");
  const [inflationRate, setInflationRate] = useState("");

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => currentYear - 5 + i);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [perfRes, invRes] = await Promise.all([
        fetch(`/api/performance?year=${year}`),
        fetch("/api/investments"),
      ]);
      if (!perfRes.ok || !invRes.ok) {
        throw new Error("Erro ao carregar dados de performance.");
      }
      const perfData: PerformancePayload = await perfRes.json();
      const invData: Investment[] = await invRes.json();
      setData(perfData);
      setInvestments(invData);
      if (!investmentId && invData.length > 0) {
        setInvestmentId(invData[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [investmentId, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = (data?.monthlySeries ?? []).map((m) => ({
    name: monthLabel(m.month),
    nominal: m.nominalReturnPercent,
    real: m.realReturnPercent,
  }));

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/monthly-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investment_id: investmentId,
          year,
          month,
          market_value: Number(marketValue),
          taxes_paid: Number(taxesPaid || 0),
          fees_paid: Number(feesPaid || 0),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar posição mensal.");
      }
      setMarketValue("");
      setTaxesPaid("");
      setFeesPaid("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar posição.");
    }
  };

  const handleSaveInflation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/monthly-macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          inflation_rate: Number(inflationRate),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar inflação mensal.");
      }
      setInflationRate("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar inflação.");
    }
  };

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">
            Performance Financeira
          </h2>
          <p className="text-sm text-slate-400">
            Retorno total nominal/real, custos e concentração.
          </p>
        </div>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {data?.warnings?.length ? (
        <Card>
          <ul className="space-y-1 text-xs text-amber-300">
            {data.warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {kpis && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs text-slate-400">Capital Investido</p>
            <p className="text-lg font-semibold text-slate-50">
              {formatCurrencyBRL(kpis.investedCapital)}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Valor de Mercado Atual</p>
            <p className="text-lg font-semibold text-slate-50">
              {formatCurrencyBRL(kpis.currentMarketValue)}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Retorno Nominal</p>
            <p className="text-lg font-semibold text-slate-50">
              {formatPercentage(kpis.nominalReturnPercent)}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Retorno Real</p>
            <p className="text-lg font-semibold text-slate-50">
              {formatPercentage(kpis.realReturnPercent)}
            </p>
          </Card>
        </div>
      )}

      <Card className="h-80">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Retorno nominal vs real
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(2)}%`}
              contentStyle={{
                backgroundColor: "#020617",
                borderColor: "#1f2937",
              }}
            />
            <Line
              type="monotone"
              dataKey="nominal"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="real"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSavePosition}
          className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-200">
            Registrar posição mensal
          </h3>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            value={investmentId}
            onChange={(e) => setInvestmentId(e.target.value)}
            required
          >
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.name} ({inv.institution})
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Valor de mercado"
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Impostos pagos"
              value={taxesPaid}
              onChange={(e) => setTaxesPaid(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Taxas/custos"
              value={feesPaid}
              onChange={(e) => setFeesPaid(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white"
          >
            Salvar posição
          </button>
        </form>

        <form
          onSubmit={handleSaveInflation}
          className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-200">
            Registrar inflação mensal
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              required
            />
            <input
              type="number"
              step="0.0001"
              placeholder="Inflação % do mês"
              value={inflationRate}
              onChange={(e) => setInflationRate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              required
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-4 text-xs font-medium text-slate-100"
          >
            Salvar inflação
          </button>
        </form>
      </div>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Concentração (última posição do ano)
        </h3>
        {loading ? (
          <p className="text-xs text-slate-400">Carregando...</p>
        ) : !data?.concentration?.length ? (
          <p className="text-xs text-slate-400">
            Sem dados de posição mensal para calcular concentração.
          </p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-300">
            {data.concentration.map((item) => (
              <li key={item.investmentId} className="flex justify-between gap-2">
                <span>{item.label}</span>
                <span className="font-medium">
                  {formatPercentage(item.sharePercent)} ({formatCurrencyBRL(item.value)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
