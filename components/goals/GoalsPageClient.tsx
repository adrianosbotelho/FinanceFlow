"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AnnualInvestmentGoal,
  Investment,
  MonthlyInvestmentGoal,
  MonthlyReturn,
} from "../../types";
import { formatCurrencyBRL, monthNameFull } from "../../lib/formatters";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type GoalRow = {
  investment: Investment;
  target: number;
  realized: number;
  progressPct: number;
  gap: number;
};

type AnnualGoalRow = {
  investment: Investment;
  target: number;
  realized: number;
  progressPct: number;
  gap: number;
};

type GoalTrendPoint = {
  month: number;
  realized: number;
  target: number;
};

type AnnualGoalChartPoint = {
  label: string;
  value: number;
  fill: string;
};

export function GoalsPageClient() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [returns, setReturns] = useState<MonthlyReturn[]>([]);
  const [goals, setGoals] = useState<MonthlyInvestmentGoal[]>([]);
  const [annualGoals, setAnnualGoals] = useState<AnnualInvestmentGoal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAnnual, setSavingAnnual] = useState(false);
  const [editingInvestmentId, setEditingInvestmentId] = useState<string | null>(null);
  const [editingAnnualInvestmentId, setEditingAnnualInvestmentId] = useState<string | null>(
    null,
  );

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [investmentId, setInvestmentId] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [annualInvestmentId, setAnnualInvestmentId] = useState("");
  const [annualTarget, setAnnualTarget] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [invRes, retRes, goalRes, annualGoalRes] = await Promise.all([
          fetch("/api/investments", { cache: "no-store" }),
          fetch(`/api/returns?year=${currentYear}`, { cache: "no-store" }),
          fetch(
            `/api/investment-goals-monthly?year=${currentYear}&month=${currentMonth}`,
            { cache: "no-store" },
          ),
          fetch(`/api/investment-goals-annual?year=${currentYear}`, {
            cache: "no-store",
          }),
        ]);
        if (!invRes.ok || !retRes.ok || !goalRes.ok || !annualGoalRes.ok) {
          const failed = [invRes, retRes, goalRes, annualGoalRes].find((r) => !r.ok);
          const msg = failed ? await failed.json().catch(() => null) : null;
          throw new Error(msg?.error ?? "Erro ao carregar metas.");
        }
        const [invData, retData, goalData, annualGoalData] = await Promise.all([
          invRes.json(),
          retRes.json(),
          goalRes.json(),
          annualGoalRes.json(),
        ]);
        const invList: Investment[] = Array.isArray(invData) ? invData : [];
        setInvestments(invList);
        setReturns(Array.isArray(retData) ? retData : []);
        setGoals(Array.isArray(goalData) ? goalData : []);
        setAnnualGoals(Array.isArray(annualGoalData) ? annualGoalData : []);
        const cdbList = invList.filter((i) => i.type === "CDB");
        if (cdbList.length > 0) {
          setInvestmentId(cdbList[0].id);
          setAnnualInvestmentId(cdbList[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar metas.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [currentYear, currentMonth]);

  const goalRows = useMemo<GoalRow[]>(() => {
    const goalMap = new Map(goals.map((g) => [g.investment_id, Number(g.monthly_target)]));
    return investments
      .filter((i) => i.type === "CDB")
      .map((investment) => {
        const target = goalMap.get(investment.id) ?? 0;
        const realized = returns
          .filter(
            (r) =>
              r.investment_id === investment.id &&
              Number(r.month) === currentMonth &&
              Number(r.year) === currentYear,
          )
          .reduce((acc, r) => acc + Number(r.income_value ?? 0), 0);
        const progressPct = target > 0 ? (realized / target) * 100 : 0;
        const gap = target - realized;
        return { investment, target, realized, progressPct, gap };
      });
  }, [goals, investments, returns, currentMonth, currentYear]);

  const annualGoalRows = useMemo<AnnualGoalRow[]>(() => {
    const goalMap = new Map(
      annualGoals
        .filter((g) => Number(g.year) === currentYear)
        .map((g) => [g.investment_id, Number(g.annual_target)]),
    );
    return investments
      .filter((i) => i.type === "CDB")
      .map((investment) => {
        const target = goalMap.get(investment.id) ?? 0;
        const realized = Number(investment.amount_invested ?? 0);
        const progressPct = target > 0 ? (realized / target) * 100 : 0;
        const gap = target - realized;
        return { investment, target, realized, progressPct, gap };
      });
  }, [annualGoals, investments, currentYear]);

  const annualTrends = useMemo(() => {
    return annualGoalRows.map((row) => {
      const series: AnnualGoalChartPoint[] = [
        { label: "Atual", value: row.realized, fill: "#22c55e" },
        { label: "Meta", value: row.target, fill: "#22d3ee" },
      ];
      const ratio = row.target > 0 ? row.realized / row.target : 0;
      const status =
        row.target <= 0
          ? "Sem meta"
          : ratio >= 1
            ? "Meta atingida"
            : ratio >= 0.8
              ? "Perto da meta"
              : "Abaixo da meta";
      return {
        row,
        series,
        status,
      };
    });
  }, [annualGoalRows]);

  const monthlyTrends = useMemo(() => {
    return goalRows.map((row) => {
      const series: GoalTrendPoint[] = Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1;
        const realized = returns
          .filter(
            (r) =>
              r.investment_id === row.investment.id &&
              Number(r.year) === currentYear &&
              Number(r.month) === month,
          )
          .reduce((acc, r) => acc + Number(r.income_value ?? 0), 0);
        return {
          month,
          realized,
          target: row.target,
        };
      });

      const latest = series[currentMonth - 1] ?? { month: currentMonth, realized: 0, target: row.target };
      const ratio = latest.target > 0 ? latest.realized / latest.target : 0;
      const status =
        latest.target <= 0
          ? "Sem meta"
          : ratio >= 1
            ? "Meta atingida"
            : ratio >= 0.8
              ? "Perto da meta"
              : "Abaixo da meta";
      return {
        row,
        series,
        status,
      };
    });
  }, [goalRows, returns, currentYear, currentMonth]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(monthlyTarget.replace(",", "."));
    if (!investmentId) return;
    if (!Number.isFinite(target) || target < 0) {
      alert("Meta mensal inválida.");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/investment-goals-monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investment_id: investmentId,
          year: currentYear,
          month: currentMonth,
          monthly_target: target,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar meta.");
      }
      const saved: MonthlyInvestmentGoal = await res.json();
      setGoals((prev) => {
        const map = new Map(prev.map((g) => [g.investment_id, g]));
        map.set(saved.investment_id, saved);
        return Array.from(map.values());
      });
      setEditingInvestmentId(null);
      setMonthlyTarget("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar meta.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row: GoalRow) => {
    setEditingInvestmentId(row.investment.id);
    setInvestmentId(row.investment.id);
    setMonthlyTarget(String(row.target || ""));
  };

  const handleDelete = async (row: GoalRow) => {
    const ok = window.confirm(`Excluir meta de ${row.investment.name}?`);
    if (!ok) return;
    const res = await fetch("/api/investment-goals-monthly", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investment_id: row.investment.id,
        year: currentYear,
        month: currentMonth,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error ?? "Erro ao excluir meta.");
      return;
    }
    setGoals((prev) => prev.filter((g) => g.investment_id !== row.investment.id));
    if (editingInvestmentId === row.investment.id) {
      setEditingInvestmentId(null);
      setMonthlyTarget("");
    }
  };

  const handleSaveAnnual = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(annualTarget.replace(",", "."));
    if (!annualInvestmentId) return;
    if (!Number.isFinite(target) || target < 0) {
      alert("Meta anual inválida.");
      return;
    }
    try {
      setSavingAnnual(true);
      const res = await fetch("/api/investment-goals-annual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investment_id: annualInvestmentId,
          year: currentYear,
          annual_target: target,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar meta anual.");
      }
      const saved: AnnualInvestmentGoal = await res.json();
      setAnnualGoals((prev) => {
        const filtered = prev.filter(
          (g) =>
            !(
              g.investment_id === saved.investment_id &&
              Number(g.year) === Number(saved.year)
            ),
        );
        return [...filtered, saved];
      });
      setEditingAnnualInvestmentId(null);
      setAnnualTarget("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar meta anual.");
    } finally {
      setSavingAnnual(false);
    }
  };

  const handleEditAnnual = (row: AnnualGoalRow) => {
    setEditingAnnualInvestmentId(row.investment.id);
    setAnnualInvestmentId(row.investment.id);
    setAnnualTarget(String(row.target || ""));
  };

  const handleDeleteAnnual = async (row: AnnualGoalRow) => {
    const ok = window.confirm(`Excluir meta anual de ${row.investment.name}?`);
    if (!ok) return;
    const res = await fetch("/api/investment-goals-annual", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investment_id: row.investment.id,
        year: currentYear,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error ?? "Erro ao excluir meta anual.");
      return;
    }
    setAnnualGoals((prev) =>
      prev.filter(
        (g) =>
          !(
            g.investment_id === row.investment.id &&
            Number(g.year) === Number(currentYear)
          ),
      ),
    );
    if (editingAnnualInvestmentId === row.investment.id) {
      setEditingAnnualInvestmentId(null);
      setAnnualTarget("");
    }
  };

  const handleRepeatNextMonth = async () => {
    const fromYear = currentYear;
    const fromMonth = currentMonth;
    const nextDate = new Date(currentYear, currentMonth, 1);
    const toYear = nextDate.getFullYear();
    const toMonth = nextDate.getMonth() + 1;
    const ok = window.confirm(
      `Repetir todas as metas de ${monthNameFull(fromMonth)}/${fromYear} para ${monthNameFull(toMonth)}/${toYear}?`,
    );
    if (!ok) return;
    const res = await fetch("/api/investment-goals-monthly/repeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromYear, fromMonth, toYear, toMonth }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      alert(payload?.error ?? "Erro ao repetir metas.");
      return;
    }
    alert(
      `Metas repetidas para ${monthNameFull(toMonth)}/${toYear}. Total: ${payload?.copied ?? 0}.`,
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Metas por Lançamento</h2>
        <p className="text-sm text-slate-400">
          Defina uma meta mensal de rendimento para cada CDB. Ex.: Itaú R$ 800 e
          Santander R$ 1.800.
        </p>
        <button
          type="button"
          onClick={() => void handleRepeatNextMonth()}
          className="mt-3 rounded-md border border-cyan-700/60 bg-cyan-900/20 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-900/35"
        >
          Repetir metas para o mês seguinte
        </button>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-200">
            Meta anual de patrimônio por investimento ({currentYear})
          </h3>
          <p className="text-xs text-slate-400">
            Realizado considera o valor atual da carteira (mesma base da página de
            Investimentos).
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
                Carregando metas anuais...
              </div>
            ) : annualGoalRows.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
                Sem investimentos CDB para exibir metas anuais.
              </div>
            ) : (
              annualGoalRows.map((row) => (
                <article
                  key={`annual-kpi-${row.investment.id}`}
                  className="rounded-xl border border-slate-800 bg-surface/80 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-400">{row.investment.institution}</p>
                      <h4 className="text-sm font-semibold text-slate-100">
                        {row.investment.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditAnnual(row)}
                        className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAnnual(row)}
                        className="rounded-md border border-rose-800/70 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-400">Meta anual</p>
                      <p className="font-semibold text-cyan-300">
                        {formatCurrencyBRL(row.target)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Carteira atual</p>
                      <p className="font-semibold text-emerald-300">
                        {formatCurrencyBRL(row.realized)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Progresso</p>
                      <p className="font-semibold text-slate-100">
                        {row.target > 0 ? `${row.progressPct.toFixed(1)}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Gap</p>
                      <p
                        className={`font-semibold ${
                          row.gap > 0 ? "text-amber-300" : "text-emerald-300"
                        }`}
                      >
                        {formatCurrencyBRL(row.gap)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
                    <div
                      className={`h-2 ${
                        row.progressPct >= 100 ? "bg-emerald-500" : "bg-cyan-500"
                      }`}
                      style={{ width: `${Math.max(0, Math.min(row.progressPct, 100))}%` }}
                    />
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <form
          onSubmit={handleSaveAnnual}
          className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-200">
            {editingAnnualInvestmentId ? "Editar meta anual" : "Nova meta anual"}
          </h3>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Investimento (CDB)</label>
            <select
              value={annualInvestmentId}
              onChange={(e) => setAnnualInvestmentId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {investments
                .filter((i) => i.type === "CDB")
                .map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name} ({inv.institution})
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Meta anual (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={annualTarget}
              onChange={(e) => setAnnualTarget(e.target.value)}
              placeholder="100000,00"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              required
            />
          </div>
          <button
            type="submit"
            disabled={savingAnnual}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white shadow-sm hover:bg-accent-soft disabled:opacity-60"
          >
            {savingAnnual ? "Salvando..." : "Salvar meta anual"}
          </button>
        </form>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">
          Direção de alcance da meta anual por lançamento
        </h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Carregando gráficos anuais...
            </div>
          ) : annualTrends.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Sem dados para gráfico anual.
            </div>
          ) : (
            annualTrends.map(({ row, series, status }) => (
              <article
                key={`annual-trend-${row.investment.id}`}
                className="rounded-xl border border-slate-800 bg-surface/80 p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-400">{row.investment.institution}</p>
                    <h4 className="text-sm font-semibold text-slate-100">
                      {row.investment.name}
                    </h4>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      status === "Meta atingida"
                        ? "bg-emerald-900/40 text-emerald-300"
                        : status === "Perto da meta"
                          ? "bg-cyan-900/40 text-cyan-300"
                          : status === "Abaixo da meta"
                            ? "bg-amber-900/40 text-amber-300"
                            : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 8, right: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="label" stroke="#94a3b8" />
                      <YAxis
                        stroke="#94a3b8"
                        tickFormatter={formatCurrencyBRL}
                        width={80}
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrencyBRL(value)}
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "#1f2937",
                        }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {series.map((entry) => (
                          <Cell
                            key={`${row.investment.id}-${entry.label}`}
                            fill={entry.fill}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">
          KPIs por investimento ({monthNameFull(currentMonth)}/{currentYear})
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Carregando KPIs...
            </div>
          ) : goalRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Sem investimentos CDB para exibir KPIs.
            </div>
          ) : (
            goalRows.map((row) => (
              <article
                key={`kpi-${row.investment.id}`}
                className="rounded-xl border border-slate-800 bg-surface/80 p-4"
              >
                <p className="text-xs text-slate-400">{row.investment.institution}</p>
                <h4 className="text-sm font-semibold text-slate-100">
                  {row.investment.name}
                </h4>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-slate-400">Meta</p>
                    <p className="font-semibold text-cyan-300">
                      {formatCurrencyBRL(row.target)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Realizado</p>
                    <p className="font-semibold text-emerald-300">
                      {formatCurrencyBRL(row.realized)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Progresso</p>
                    <p className="font-semibold text-slate-100">
                      {row.target > 0 ? `${row.progressPct.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Gap</p>
                    <p
                      className={`font-semibold ${
                        row.gap > 0 ? "text-amber-300" : "text-emerald-300"
                      }`}
                    >
                      {formatCurrencyBRL(row.gap)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-2 ${
                      row.progressPct >= 100 ? "bg-emerald-500" : "bg-cyan-500"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(row.progressPct, 100))}%` }}
                  />
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">
          Direção de alcance da meta por lançamento
        </h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Carregando gráficos...
            </div>
          ) : monthlyTrends.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Sem dados para gráfico.
            </div>
          ) : (
            monthlyTrends.map(({ row, series, status }) => (
              <article
                key={`trend-${row.investment.id}`}
                className="rounded-xl border border-slate-800 bg-surface/80 p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-400">{row.investment.institution}</p>
                    <h4 className="text-sm font-semibold text-slate-100">
                      {row.investment.name}
                    </h4>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      status === "Meta atingida"
                        ? "bg-emerald-900/40 text-emerald-300"
                        : status === "Perto da meta"
                          ? "bg-cyan-900/40 text-cyan-300"
                          : status === "Abaixo da meta"
                            ? "bg-amber-900/40 text-amber-300"
                            : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 8, right: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis
                        stroke="#94a3b8"
                        tickFormatter={formatCurrencyBRL}
                        width={80}
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrencyBRL(value)}
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "#1f2937",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="realized"
                        name="Realizado"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="target"
                        name="Meta"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="6 3"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            Progresso no mês atual ({monthNameFull(currentMonth)}/{currentYear})
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Investimento</th>
                  <th className="px-2 py-2">Meta mensal</th>
                  <th className="px-2 py-2">Realizado</th>
                  <th className="px-2 py-2">Progresso</th>
                  <th className="px-2 py-2">Gap</th>
                  <th className="px-2 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                      Carregando metas...
                    </td>
                  </tr>
                ) : goalRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                      Nenhum CDB encontrado.
                    </td>
                  </tr>
                ) : (
                  goalRows.map((row) => (
                    <tr
                      key={row.investment.id}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-2 py-2 text-slate-300">
                        {row.investment.name} ({row.investment.institution})
                      </td>
                      <td className="px-2 py-2 text-cyan-300">
                        {formatCurrencyBRL(row.target)}
                      </td>
                      <td className="px-2 py-2 text-emerald-300">
                        {formatCurrencyBRL(row.realized)}
                      </td>
                      <td className="px-2 py-2 text-slate-200">
                        {row.target > 0 ? `${row.progressPct.toFixed(1)}%` : "—"}
                      </td>
                      <td
                        className={`px-2 py-2 ${
                          row.gap > 0 ? "text-amber-300" : "text-emerald-300"
                        }`}
                      >
                        {formatCurrencyBRL(row.gap)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleEdit(row)}
                          className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          className="ml-2 rounded-md border border-rose-800/70 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form
          onSubmit={handleSave}
          className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-200">
            {editingInvestmentId ? "Editar meta" : "Nova meta"}
          </h3>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Investimento (CDB)</label>
            <select
              value={investmentId}
              onChange={(e) => setInvestmentId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {investments
                .filter((i) => i.type === "CDB")
                .map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name} ({inv.institution})
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Meta mensal (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(e.target.value)}
              placeholder="800,00"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white shadow-sm hover:bg-accent-soft disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar meta"}
          </button>
        </form>
      </div>
    </div>
  );
}
