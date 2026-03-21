"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Investment } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { publishDataSyncUpdate } from "../../lib/client-data-sync";
import { InvestmentForm } from "../forms/InvestmentForm";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

type ForecastResponse = {
  cdbInvested: number;
  cdiAnnualRatePct: number;
  year: number;
  currentMonth: number;
  kpis: {
    monthForecast: number;
    monthRealized: number;
    monthGap: number;
    completionPercent: number;
    expectedToDate: number;
    pacePercent: number;
    elapsedBusinessDays: number;
    totalBusinessDays: number;
  };
  series: Array<{ month: number; realized: number; forecast: number }>;
  daySeries: Array<{
    day: number;
    realizedAccumulated: number | null;
    forecastAccumulated: number;
  }>;
  cdbBreakdown: Array<{
    investmentId: string;
    label: string;
    institution: string;
    amountInvested: number;
    current: {
      forecast: number;
      realized: number;
      gap: number;
      completionPercent: number;
    };
    series: Array<{ month: number; realized: number; forecast: number }>;
  }>;
};

export function InvestmentsPageClient() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [cdiScenario, setCdiScenario] = useState<string>("default");
  const [customCdi, setCustomCdi] = useState<string>("");

  const loadInvestments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/investments", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Não foi possível carregar investimentos.");
      }
      const data: Investment[] = await res.json();
      setInvestments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erro ao carregar investimentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvestments();
  }, [loadInvestments]);
  const resolvedCdiRate = useMemo(() => {
    if (cdiScenario === "custom") {
      const parsed = Number(customCdi.replace(",", "."));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    if (cdiScenario === "9") return 9;
    if (cdiScenario === "10.5") return 10.5;
    if (cdiScenario === "12") return 12;
    return null;
  }, [cdiScenario, customCdi]);

  const loadForecast = useCallback(async () => {
    try {
      const year = new Date().getFullYear();
      const params = new URLSearchParams({ year: String(year) });
      if (resolvedCdiRate !== null) {
        params.set("cdi_annual_rate", String(resolvedCdiRate));
      }
      const res = await fetch(`/api/investments/forecast?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data: ForecastResponse = await res.json();
      setForecast(data);
    } catch (_err) {
      // no-op
    }
  }, [resolvedCdiRate]);

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const totalInvested = useMemo(
    () => investments.reduce((acc, inv) => acc + Number(inv.amount_invested ?? 0), 0),
    [investments],
  );
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Investment[]>();
    for (const inv of investments) {
      const key = `${inv.type}::${inv.institution.toLowerCase()}::${inv.name.toLowerCase()}`;
      const group = map.get(key) ?? [];
      group.push(inv);
      map.set(key, group);
    }
    return Array.from(map.values()).filter((g) => g.length > 1);
  }, [investments]);
  const byType = useMemo(() => {
    const cdb = investments
      .filter((inv) => inv.type === "CDB")
      .reduce((acc, inv) => acc + Number(inv.amount_invested ?? 0), 0);
    const fii = investments
      .filter((inv) => inv.type === "FII")
      .reduce((acc, inv) => acc + Number(inv.amount_invested ?? 0), 0);
    return { cdb, fii };
  }, [investments]);
  const allocationRows = useMemo(() => {
    const base = totalInvested > 0 ? totalInvested : 1;
    return investments
      .map((inv) => {
        const amount = Number(inv.amount_invested ?? 0);
        const sharePct = (amount / base) * 100;
        return { ...inv, amount, sharePct };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [investments, totalInvested]);
  const concentrationMetrics = useMemo(() => {
    const shares = allocationRows.map((row) => row.sharePct / 100);
    const hhiRaw = shares.reduce((acc, s) => acc + s * s, 0);
    const hhi = hhiRaw * 10000;
    const effectiveCount = hhiRaw > 0 ? 1 / hhiRaw : 0;
    const top1 = allocationRows[0]?.sharePct ?? 0;
    const top3 = allocationRows
      .slice(0, 3)
      .reduce((acc, row) => acc + row.sharePct, 0);
    const institutions = new Set(
      investments.map((inv) => `${inv.type}:${inv.institution.toLowerCase()}`),
    ).size;
    return { hhi, effectiveCount, top1, top3, institutions };
  }, [allocationRows, investments]);
  const investmentKpiCardClass =
    "flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md";

  const handleSaved = async () => {
    setEditing(null);
    await loadInvestments();
    await loadForecast();
    publishDataSyncUpdate("investments");
  };

  const handleDelete = async (inv: Investment) => {
    const confirmed = window.confirm(
      `Excluir "${inv.name}"? Isso também removerá os retornos mensais vinculados a este investimento.`,
    );
    if (!confirmed) return;
    setDeletingId(inv.id);
    try {
      const res = await fetch(`/api/investments/${inv.id}`, { method: "DELETE" });
      if (!res.ok) {
        let message = "Falha ao excluir investimento.";
        try {
          const err = await res.json();
          if (err?.error) message = err.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      if (editing?.id === inv.id) {
        setEditing(null);
      }
      await loadInvestments();
      await loadForecast();
      publishDataSyncUpdate("investments");
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Erro ao excluir investimento.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Investimentos</h2>
        <p className="text-sm text-slate-400">
          Gerencie os lançamentos da carteira (incluir, editar e excluir) com
          vínculo direto aos retornos mensais.
        </p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {duplicateGroups.length > 0 && (
        <p className="text-sm text-amber-300">
          Foram encontrados investimentos duplicados com mesmo tipo/instituição/nome.
          Isso pode causar leitura confusa nos retornos mensais.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div className={investmentKpiCardClass}>
          <p className="text-sm font-medium text-slate-500">Patrimônio investido</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-50">
            {formatCurrencyBRL(totalInvested)}
          </p>
        </div>
        <div className={investmentKpiCardClass}>
          <p className="text-sm font-medium text-slate-500">Maior posição</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-50">
            {formatPercentage(concentrationMetrics.top1)}
          </p>
          <p className="mt-auto text-[11px] text-slate-500">do total da carteira</p>
        </div>
        <div className={investmentKpiCardClass}>
          <p className="text-sm font-medium text-slate-500">Concentração Top 3</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-50">
            {formatPercentage(concentrationMetrics.top3)}
          </p>
          <p className="mt-auto text-[11px] text-slate-500">três maiores posições</p>
        </div>
        <div className={investmentKpiCardClass}>
          <p className="text-sm font-medium text-slate-500">Diversificação efetiva</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-50">
            {concentrationMetrics.effectiveCount.toFixed(2)}
          </p>
          <p className="mt-auto text-[11px] text-slate-500">
            ativos equivalentes (HHI {concentrationMetrics.hhi.toFixed(0)})
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className={investmentKpiCardClass}>
          <p className="text-sm font-medium text-slate-500">Exposição em CDB</p>
          <p className="text-2xl font-extrabold tracking-tight text-amber-300">
            {formatCurrencyBRL(byType.cdb)}
          </p>
          <p className="mt-auto text-[11px] text-slate-500">
            {formatPercentage(totalInvested > 0 ? (byType.cdb / totalInvested) * 100 : 0)}
          </p>
        </div>
        <div className={investmentKpiCardClass}>
          <p className="text-sm font-medium text-slate-500">Exposição em FII</p>
          <p className="text-2xl font-extrabold tracking-tight text-emerald-300">
            {formatCurrencyBRL(byType.fii)}
          </p>
          <p className="mt-auto text-[11px] text-slate-500">
            {formatPercentage(totalInvested > 0 ? (byType.fii / totalInvested) * 100 : 0)}
          </p>
        </div>
        <div className={investmentKpiCardClass}>
          <p className="text-sm font-medium text-slate-500">Instituições ativas</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-50">
            {concentrationMetrics.institutions}
          </p>
          <p className="mt-auto text-[11px] text-slate-500">tipo + instituição distintos</p>
        </div>
      </div>

      {forecast && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-surface/80 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Projeção CDB (100% CDI) vs Realizado
              </h3>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Cenário CDI</label>
                <select
                  value={cdiScenario}
                  onChange={(e) => setCdiScenario(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                >
                  <option value="default">Atual (env)</option>
                  <option value="9">9,00%</option>
                  <option value="10.5">10,50%</option>
                  <option value="12">12,00%</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>
              {cdiScenario === "custom" && (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">CDI anual (%)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customCdi}
                    onChange={(e) => setCustomCdi(e.target.value)}
                    placeholder="10,65"
                    className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  />
                </div>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400">
              Mês atual: previsão {formatCurrencyBRL(forecast.kpis.monthForecast)} | realizado{" "}
              {formatCurrencyBRL(forecast.kpis.monthRealized)} | gap{" "}
              {formatCurrencyBRL(forecast.kpis.monthGap)}.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs text-slate-400">Previsão mês atual</p>
              <p className="text-base font-semibold text-cyan-300">
                {formatCurrencyBRL(forecast.kpis.monthForecast)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs text-slate-400">Realizado mês atual</p>
              <p className="text-base font-semibold text-emerald-300">
                {formatCurrencyBRL(forecast.kpis.monthRealized)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs text-slate-400">Atingimento</p>
              <p className="text-base font-semibold text-slate-100">
                {formatPercentage(forecast.kpis.completionPercent)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs text-slate-400">Pace até hoje</p>
              <p className="text-base font-semibold text-slate-100">
                {formatPercentage(forecast.kpis.pacePercent)}
              </p>
              <p className="text-[11px] text-slate-500">
                esperado até hoje: {formatCurrencyBRL(forecast.kpis.expectedToDate)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="mb-1 text-xs text-slate-400">
              Consolidado CDBs (Itaú + Santander): previsto vs realizado por mês
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecast.series} margin={{ left: 18, right: 4, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <ReferenceLine
                    x={forecast.currentMonth}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    strokeOpacity={0.95}
                  />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    interval={0}
                    minTickGap={0}
                    tick={{ fontSize: 11 }}
                    tickMargin={6}
                    padding={{ left: 2, right: 2 }}
                    tickFormatter={(value) => monthLabel(Number(value))}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tickFormatter={formatCurrencyBRL}
                    width={96}
                  />
                  <Tooltip
                    formatter={(v: number) => formatCurrencyBRL(v)}
                    labelFormatter={(value) => `Mês: ${monthLabel(Number(value))}`}
                    contentStyle={{ backgroundColor: "#020617", borderColor: "#1f2937" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Previsto consolidado"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="realized"
                    name="Realizado consolidado"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {forecast.cdbBreakdown.map((item) => (
              <div
                key={item.investmentId}
                className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
              >
                <div className="mb-2">
                  <p className="text-xs text-slate-400">{item.institution}</p>
                  <p className="text-sm font-semibold text-slate-100">{item.label}</p>
                  <p className="text-[11px] text-slate-400">
                    Investido: {formatCurrencyBRL(item.amountInvested)} | Previsto mês:{" "}
                    {formatCurrencyBRL(item.current.forecast)} | Realizado mês:{" "}
                    {formatCurrencyBRL(item.current.realized)}
                  </p>
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={item.series}
                      margin={{ left: 20, right: 4, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <ReferenceLine
                        x={forecast.currentMonth}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        strokeOpacity={0.95}
                      />
                      <XAxis
                        dataKey="month"
                        stroke="#94a3b8"
                        interval={0}
                        minTickGap={0}
                        tick={{ fontSize: 11 }}
                        tickMargin={6}
                        padding={{ left: 2, right: 2 }}
                        tickFormatter={(value) => monthLabel(Number(value))}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        tickFormatter={formatCurrencyBRL}
                        width={104}
                      />
                      <Tooltip
                        formatter={(v: number) => formatCurrencyBRL(v)}
                        labelFormatter={(value) => `Mês: ${monthLabel(Number(value))}`}
                        contentStyle={{ backgroundColor: "#020617", borderColor: "#1f2937" }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        name="Previsto"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={{ r: 1.5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="realized"
                        name="Realizado"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ r: 1.5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>

          <div className="h-64 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
            <p className="mb-1 px-2 text-xs text-slate-400">
              Intramês consolidado (Itaú + Santander): curva prevista acumulada e posição realizada atual
            </p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast.daySeries} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis
                  stroke="#94a3b8"
                  tickFormatter={formatCurrencyBRL}
                  width={80}
                />
                <Tooltip
                  formatter={(v: number) => formatCurrencyBRL(v)}
                  contentStyle={{ backgroundColor: "#020617", borderColor: "#1f2937" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="forecastAccumulated"
                  name="Previsto acumulado (mês atual)"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="realizedAccumulated"
                  name="Realizado acumulado (mês atual)"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Carteira atual</h3>
            <span className="text-xs text-slate-400">
              Total investido: {formatCurrencyBRL(totalInvested)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Instituição</th>
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">Valor Investido</th>
                  <th className="px-2 py-2">% Carteira</th>
                  <th className="px-2 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                      Carregando investimentos...
                    </td>
                  </tr>
                ) : investments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                      Nenhum investimento cadastrado.
                    </td>
                  </tr>
                ) : (
                  allocationRows.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-2 py-2 text-slate-300">{inv.type}</td>
                      <td className="px-2 py-2 text-slate-300">{inv.institution}</td>
                      <td className="px-2 py-2 text-slate-300">{inv.name}</td>
                      <td className="px-2 py-2 font-medium text-slate-100">
                        {formatCurrencyBRL(inv.amount_invested)}
                      </td>
                      <td className="px-2 py-2 text-slate-300">
                        {formatPercentage(inv.sharePct)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setEditing(inv)}
                          className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(inv)}
                          disabled={deletingId === inv.id}
                          className="ml-2 rounded-md border border-rose-800/70 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30 disabled:opacity-50"
                        >
                          {deletingId === inv.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <InvestmentForm
          initial={editing}
          onSaved={handleSaved}
          onCancelEdit={() => setEditing(null)}
        />
      </div>
    </div>
  );
}
