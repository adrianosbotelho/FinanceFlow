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
  PerformancePayload,
} from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  initialYear: number;
}

function inflationSourceLabel(source: PerformancePayload["inflationSource"]): string {
  if (source === "bcb") return "Inflação automática: BCB IPCA (SGS 433)";
  if (source === "manual") return "Inflação manual: tabela monthly_macro";
  return "Inflação indisponível (retorno real com fallback em 0%)";
}

export function PerformancePageClient({ initialYear }: Props) {
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [positionInvestmentId, setPositionInvestmentId] = useState("");
  const [positionMonth, setPositionMonth] = useState(new Date().getMonth() + 1);
  const [marketValue, setMarketValue] = useState("");

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => currentYear - 5 + i);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [perfRes, invRes] = await Promise.all([
        fetch(`/api/performance?year=${year}`, { cache: "no-store" }),
        fetch("/api/investments", { cache: "no-store" }),
      ]);
      if (!perfRes.ok || !invRes.ok) {
        throw new Error("Erro ao carregar dados de performance.");
      }
      const perfData: PerformancePayload = await perfRes.json();
      const invData: Investment[] = await invRes.json();

      setData(perfData);
      setInvestments(invData);

      if (!positionInvestmentId && invData.length > 0) {
        setPositionInvestmentId(invData[0].id);
      }

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [positionInvestmentId, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = (data?.monthlySeries ?? []).map((monthPoint) => ({
    name: monthLabel(monthPoint.month),
    nominal: monthPoint.nominalReturnPercent,
    real: monthPoint.realReturnPercent,
  }));

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/monthly-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investment_id: positionInvestmentId,
          year,
          month: positionMonth,
          market_value: Number(marketValue),
          taxes_paid: 0,
          fees_paid: 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar posição mensal.");
      }
      setMarketValue("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar posição.");
    }
  };

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Performance Financeira</h2>
          <p className="text-sm text-slate-400">
            Visão de retorno nominal/real para CDBs e FIIs, com inflação automática.
          </p>
        </div>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {data ? (
        <Card>
          <p className="text-xs text-cyan-300">{inflationSourceLabel(data.inflationSource)}</p>
          <p className="mt-1 text-xs text-slate-400">
            Aportes, resgates, impostos e taxas devem ser lançados em Retornos Mensais no bloco de eventos de caixa.
          </p>
        </Card>
      ) : null}

      {data?.warnings?.length ? (
        <Card>
          <ul className="space-y-1 text-xs text-amber-300">
            {data.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <p className="text-xs text-slate-400">Capital Base Atual</p>
            <p className="text-lg font-semibold text-slate-50">{formatCurrencyBRL(kpis.currentCostBasis)}</p>
            <p className="text-[11px] text-slate-500">Investido + aportes - resgates</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Valor de Mercado Atual</p>
            <p className="text-lg font-semibold text-slate-50">{formatCurrencyBRL(kpis.currentMarketValue)}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Renda Líquida YTD</p>
            <p className="text-lg font-semibold text-emerald-300">{formatCurrencyBRL(kpis.ytdPassiveIncomeNet)}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Impostos (YTD)</p>
            <p className="text-lg font-semibold text-rose-300">{formatCurrencyBRL(kpis.ytdTaxes)}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Taxas/Custos (YTD)</p>
            <p className="text-lg font-semibold text-rose-300">{formatCurrencyBRL(kpis.ytdFees)}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Retorno Nominal / Real</p>
            <p className="text-lg font-semibold text-slate-50">
              {formatPercentage(kpis.nominalReturnPercent)} / {formatPercentage(kpis.realReturnPercent)}
            </p>
          </Card>
        </div>
      ) : null}

      <Card className="h-80">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Retorno acumulado nominal vs real</h3>
        <p className="mb-2 text-xs text-slate-400">Nominal considera fluxo líquido; real desconta inflação mensal.</p>
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
            <Line type="monotone" dataKey="nominal" name="Nominal" stroke="#22d3ee" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="real" name="Real" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <form
        onSubmit={handleSavePosition}
        className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
      >
        <h3 className="text-sm font-semibold text-slate-200">Registrar posição de mercado (opcional)</h3>
        <p className="text-xs text-slate-400">
          Use apenas se quiser sobrescrever a estimativa automática do valor de mercado no mês.
        </p>
        <select
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={positionInvestmentId}
          onChange={(e) => setPositionInvestmentId(e.target.value)}
          required
        >
          {investments.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.name} ({inv.institution})
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={positionMonth}
            onChange={(e) => setPositionMonth(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
            required
          >
            {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor de mercado"
            value={marketValue}
            onChange={(e) => setMarketValue(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
            required
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white"
        >
          Salvar posição
        </button>
      </form>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Concentração da carteira</h3>
        {loading ? (
          <p className="text-xs text-slate-400">Carregando...</p>
        ) : !data?.concentration?.length ? (
          <p className="text-xs text-slate-400">Sem dados para calcular concentração.</p>
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
