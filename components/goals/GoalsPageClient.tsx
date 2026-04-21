"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AnnualInvestmentGoal,
  Investment,
  InvestmentCashEvent,
  MonthlyInvestmentGoal,
  MonthlyPosition,
  MonthlyReturn,
} from "../../types";
import { formatCurrencyBRL, monthLabel, monthNameFull } from "../../lib/formatters";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ReferenceDot,
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
  label: string;
  realized: number;
  target: number;
};

type AnnualGoalChartPoint = {
  month: number;
  label: string;
  realized: number | null;
  annualGap: number | null;
};

type AnnualGoalEtaRow = {
  row: AnnualGoalRow;
  avgMonthlyAporte: number;
  avgMonthlyIncome: number;
  projectedMonthlyGrowth: number;
  monthsToTarget: number | null;
  projectedMonth: number | null;
  projectedYear: number | null;
  status: "Atingida" | "No ritmo" | "Após o ano" | "Sem ritmo";
};

function countBusinessDaysRemainingInMonth(referenceDate: Date): number {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = referenceDate.getDate() + 1; day <= lastDay; day += 1) {
    const weekday = new Date(year, month, day).getDay();
    if (weekday >= 1 && weekday <= 5) {
      count += 1;
    }
  }
  return count;
}

export function GoalsPageClient() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [returns, setReturns] = useState<MonthlyReturn[]>([]);
  const [positions, setPositions] = useState<MonthlyPosition[]>([]);
  const [cashEvents, setCashEvents] = useState<InvestmentCashEvent[]>([]);
  const [goals, setGoals] = useState<MonthlyInvestmentGoal[]>([]);
  const [annualGoals, setAnnualGoals] = useState<AnnualInvestmentGoal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goalType, setGoalType] = useState<"monthly" | "annual">("monthly");
  const [formInvestmentId, setFormInvestmentId] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [editingGoal, setEditingGoal] = useState<{
    type: "monthly" | "annual";
    investmentId: string;
  } | null>(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const businessDaysRemaining = countBusinessDaysRemainingInMonth(new Date());

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [invRes, retRes, posRes, cashRes, goalRes, annualGoalRes] = await Promise.all([
          fetch("/api/investments", { cache: "no-store" }),
          fetch(`/api/returns?year=${currentYear}`, { cache: "no-store" }),
          fetch(`/api/monthly-positions?year=${currentYear}`, { cache: "no-store" }),
          fetch(`/api/investment-cash-events?year=${currentYear}`, { cache: "no-store" }),
          fetch(
            `/api/investment-goals-monthly?year=${currentYear}&month=${currentMonth}`,
            { cache: "no-store" },
          ),
          fetch(`/api/investment-goals-annual?year=${currentYear}`, {
            cache: "no-store",
          }),
        ]);
        if (!invRes.ok || !retRes.ok || !posRes.ok || !cashRes.ok || !goalRes.ok || !annualGoalRes.ok) {
          const failed = [invRes, retRes, posRes, cashRes, goalRes, annualGoalRes].find((r) => !r.ok);
          const msg = failed ? await failed.json().catch(() => null) : null;
          throw new Error(msg?.error ?? "Erro ao carregar metas.");
        }
        const [invData, retData, posData, eventsData, goalData, annualGoalData] = await Promise.all([
          invRes.json(),
          retRes.json(),
          posRes.json(),
          cashRes.json(),
          goalRes.json(),
          annualGoalRes.json(),
        ]);
        const invList: Investment[] = Array.isArray(invData) ? invData : [];
        setInvestments(invList);
        setReturns(Array.isArray(retData) ? retData : []);
        setPositions(Array.isArray(posData) ? posData : []);
        setCashEvents(Array.isArray(eventsData) ? eventsData : []);
        setGoals(Array.isArray(goalData) ? goalData : []);
        setAnnualGoals(Array.isArray(annualGoalData) ? annualGoalData : []);
        const cdbList = invList.filter((i) => i.type === "CDB");
        if (cdbList.length > 0) {
          setFormInvestmentId(cdbList[0].id);
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
      const returnsByMonth = new Map<number, number>();
      for (let month = 1; month <= 12; month += 1) {
        const monthIncome = returns
          .filter(
            (ret) =>
              ret.investment_id === row.investment.id &&
              Number(ret.year) === currentYear &&
              Number(ret.month) === month,
          )
          .reduce((acc, ret) => acc + Number(ret.income_value ?? 0), 0);
        returnsByMonth.set(month, monthIncome);
      }

      const positionsByMonth = new Map<number, number>();
      for (const pos of positions) {
        if (
          pos.investment_id === row.investment.id &&
          Number(pos.year) === currentYear &&
          Number(pos.month) >= 1 &&
          Number(pos.month) <= 12
        ) {
          positionsByMonth.set(Number(pos.month), Number(pos.market_value ?? 0));
        }
      }

      const totalYtdReturn = Array.from({ length: currentMonth }, (_, idx) => idx + 1).reduce(
        (acc, month) => acc + (returnsByMonth.get(month) ?? 0),
        0,
      );
      const estimatedStartOfYear = row.realized - totalYtdReturn;

      let cumulativeReturn = 0;
      const series: AnnualGoalChartPoint[] = Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1;
        cumulativeReturn += returnsByMonth.get(month) ?? 0;
        const estimatedMonthValue = estimatedStartOfYear + cumulativeReturn;
        const monthlyPositionValue = positionsByMonth.get(month);
        const realizedValue =
          month <= currentMonth
            ? monthlyPositionValue ?? Math.max(0, estimatedMonthValue)
            : null;
        const annualGapValue =
          realizedValue === null ? null : Number(Math.max(row.target - realizedValue, 0).toFixed(2));
        return {
          month,
          label: monthLabel(month),
          realized: realizedValue,
          annualGap: annualGapValue,
        };
      });
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
  }, [annualGoalRows, currentMonth, currentYear, positions, returns]);

  const annualEtaRows = useMemo<AnnualGoalEtaRow[]>(() => {
    const monthWindowStart = Math.max(1, currentMonth - 2);
    const monthsWindow = Array.from(
      { length: currentMonth - monthWindowStart + 1 },
      (_, idx) => monthWindowStart + idx,
    );

    function addMonths(baseYear: number, baseMonth: number, monthsToAdd: number) {
      const date = new Date(baseYear, baseMonth - 1 + monthsToAdd, 1);
      return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
      };
    }

    return annualGoalRows.map((row) => {
      const avgMonthlyAporte =
        monthsWindow.length > 0
          ? monthsWindow.reduce((acc, month) => {
              const totalAporte = cashEvents
                .filter(
                  (event) =>
                    event.investment_id === row.investment.id &&
                    Number(event.year) === currentYear &&
                    Number(event.month) === month &&
                    event.type === "APORTE",
                )
                .reduce((sum, event) => sum + Number(event.amount ?? 0), 0);
              return acc + totalAporte;
            }, 0) / monthsWindow.length
          : 0;

      const avgMonthlyIncome =
        monthsWindow.length > 0
          ? monthsWindow.reduce((acc, month) => {
              const monthIncome = returns
                .filter(
                  (ret) =>
                    ret.investment_id === row.investment.id &&
                    Number(ret.year) === currentYear &&
                    Number(ret.month) === month,
                )
                .reduce((sum, ret) => sum + Number(ret.income_value ?? 0), 0);
              return acc + monthIncome;
            }, 0) / monthsWindow.length
          : 0;

      const projectedMonthlyGrowth = avgMonthlyAporte + avgMonthlyIncome;
      const gap = Math.max(row.target - row.realized, 0);

      if (gap <= 0) {
        return {
          row,
          avgMonthlyAporte,
          avgMonthlyIncome,
          projectedMonthlyGrowth,
          monthsToTarget: 0,
          projectedMonth: currentMonth,
          projectedYear: currentYear,
          status: "Atingida",
        };
      }

      if (projectedMonthlyGrowth <= 0) {
        return {
          row,
          avgMonthlyAporte,
          avgMonthlyIncome,
          projectedMonthlyGrowth,
          monthsToTarget: null,
          projectedMonth: null,
          projectedYear: null,
          status: "Sem ritmo",
        };
      }

      const monthsToTarget = Math.ceil(gap / projectedMonthlyGrowth);
      const projected = addMonths(currentYear, currentMonth, monthsToTarget);
      const status = projected.year > currentYear ? "Após o ano" : "No ritmo";

      return {
        row,
        avgMonthlyAporte,
        avgMonthlyIncome,
        projectedMonthlyGrowth,
        monthsToTarget,
        projectedMonth: projected.month,
        projectedYear: projected.year,
        status,
      };
    });
  }, [annualGoalRows, cashEvents, currentMonth, currentYear, returns]);

  const cdbInvestments = useMemo(
    () => investments.filter((investment) => investment.type === "CDB"),
    [investments],
  );

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
          label: monthLabel(month),
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
    const target = Number(formTarget.replace(",", "."));
    if (!formInvestmentId) return;
    if (!Number.isFinite(target) || target < 0) {
      alert(`Meta ${goalType === "monthly" ? "mensal" : "anual"} inválida.`);
      return;
    }
    try {
      setSaving(true);
      const endpoint =
        goalType === "monthly"
          ? "/api/investment-goals-monthly"
          : "/api/investment-goals-annual";
      const payload =
        goalType === "monthly"
          ? {
              investment_id: formInvestmentId,
              year: currentYear,
              month: currentMonth,
              monthly_target: target,
            }
          : {
              investment_id: formInvestmentId,
              year: currentYear,
              annual_target: target,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar meta.");
      }
      if (goalType === "monthly") {
        const saved: MonthlyInvestmentGoal = await res.json();
        setGoals((prev) => {
          const map = new Map(prev.map((g) => [g.investment_id, g]));
          map.set(saved.investment_id, saved);
          return Array.from(map.values());
        });
      } else {
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
      }
      setEditingGoal(null);
      setFormTarget("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar meta.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row: GoalRow) => {
    setEditingGoal({ type: "monthly", investmentId: row.investment.id });
    setGoalType("monthly");
    setFormInvestmentId(row.investment.id);
    setFormTarget(String(row.target || ""));
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
    if (
      editingGoal?.type === "monthly" &&
      editingGoal.investmentId === row.investment.id
    ) {
      setEditingGoal(null);
      setFormTarget("");
    }
  };

  const handleEditAnnual = (row: AnnualGoalRow) => {
    setEditingGoal({ type: "annual", investmentId: row.investment.id });
    setGoalType("annual");
    setFormInvestmentId(row.investment.id);
    setFormTarget(String(row.target || ""));
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
    if (
      editingGoal?.type === "annual" &&
      editingGoal.investmentId === row.investment.id
    ) {
      setEditingGoal(null);
      setFormTarget("");
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
          Defina metas mensais de rendimento e metas anuais de patrimônio para cada CDB.
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
          onSubmit={handleSave}
          className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-200">
            {editingGoal ? "Editar meta" : "Nova meta"}
          </h3>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Tipo de meta</label>
            <select
              value={goalType}
              onChange={(e) => {
                const nextType = e.target.value as "monthly" | "annual";
                setGoalType(nextType);
                setEditingGoal(null);
                setFormTarget("");
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="monthly">Mensal (rendimento)</option>
              <option value="annual">Anual (patrimônio)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Investimento (CDB)</label>
            <select
              value={formInvestmentId}
              onChange={(e) => setFormInvestmentId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {cdbInvestments.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name} ({inv.institution})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">
              {goalType === "monthly" ? "Meta mensal (R$)" : "Meta anual (R$)"}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={formTarget}
              onChange={(e) => setFormTarget(e.target.value)}
              placeholder={goalType === "monthly" ? "800,00" : "100000,00"}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white shadow-sm hover:bg-accent-soft disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar meta"}
            </button>
            {editingGoal ? (
              <button
                type="button"
                onClick={() => {
                  setEditingGoal(null);
                  setFormTarget("");
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-4 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Cancelar edição
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">
          Faltante para meta anual por mês
        </h3>
        <p className="text-xs text-slate-400">
          Quanto ainda falta (R$) para atingir a meta anual em cada mês. Objetivo: chegar em R$ 0,00.
        </p>
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
                    <BarChart data={series} margin={{ top: 8, right: 20, left: 24, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <ReferenceLine
                        x={currentMonth}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        strokeOpacity={0.95}
                        label={{
                          value: "Mês atual",
                          position: "top",
                          fill: "#f59e0b",
                          fontSize: 10,
                        }}
                      />
                      <XAxis
                        dataKey="month"
                        stroke="#94a3b8"
                        padding={{ left: 4, right: 12 }}
                        interval={0}
                        minTickGap={0}
                        tick={{ fontSize: 11 }}
                        tickMargin={6}
                        tickFormatter={(value) => monthLabel(Number(value))}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        tickFormatter={formatCurrencyBRL}
                        width={110}
                        domain={[
                          0,
                          (dataMax: number) => Math.max(dataMax * 1.1, 1),
                        ]}
                      />
                      <ReferenceLine y={0} stroke="#64748b" strokeOpacity={0.8} />
                      <Tooltip
                        formatter={(value) => {
                          const rawValue = Array.isArray(value) ? value[0] : value;
                          const numericValue = Number(rawValue);
                          if (!Number.isFinite(numericValue)) return "—";
                          return formatCurrencyBRL(numericValue);
                        }}
                        labelFormatter={(value) => `Mês: ${monthLabel(Number(value))}`}
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "#1f2937",
                          color: "#e2e8f0",
                        }}
                        labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                        itemStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend
                        iconType="circle"
                        formatter={(value) => (
                          <span style={{ color: "#e2e8f0" }}>{String(value)}</span>
                        )}
                      />
                      <Bar dataKey="annualGap" name="Faltante para meta anual" fill="#22c55e" legendType="circle">
                        {series.map((point) => (
                          <Cell
                            key={`gap-${row.investment.id}-${point.month}`}
                            fill={
                              point.annualGap === null
                                ? "#334155"
                                : point.annualGap === 0
                                  ? "#22c55e"
                                  : point.annualGap <= row.target * 0.2
                                    ? "#22d3ee"
                                    : point.annualGap <= row.target * 0.5
                                      ? "#f59e0b"
                                      : "#f43f5e"
                            }
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
          Prazo estimado para atingir meta anual (aporte + rendimento)
        </h3>
        <p className="text-xs text-slate-400">
          Estimativa usando média dos últimos até 3 meses (até {monthNameFull(currentMonth)}): aporte mensal + rendimento mensal.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Carregando estimativas...
            </div>
          ) : annualEtaRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-surface/80 p-4 text-sm text-slate-400">
              Sem metas anuais para estimar prazo.
            </div>
          ) : (
            annualEtaRows.map((eta) => (
              <article
                key={`annual-eta-${eta.row.investment.id}`}
                className="rounded-xl border border-slate-800 bg-surface/80 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-400">{eta.row.investment.institution}</p>
                    <h4 className="text-sm font-semibold text-slate-100">
                      {eta.row.investment.name}
                    </h4>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      eta.status === "Atingida"
                        ? "bg-emerald-900/40 text-emerald-300"
                        : eta.status === "No ritmo"
                          ? "bg-cyan-900/40 text-cyan-300"
                          : eta.status === "Após o ano"
                            ? "bg-amber-900/40 text-amber-300"
                            : "bg-rose-900/40 text-rose-300"
                    }`}
                  >
                    {eta.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-slate-400">Gap atual</p>
                    <p className="font-semibold text-amber-300">
                      {formatCurrencyBRL(Math.max(eta.row.gap, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Crescimento mensal projetado</p>
                    <p className="font-semibold text-emerald-300">
                      {formatCurrencyBRL(eta.projectedMonthlyGrowth)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Aporte médio/mês</p>
                    <p className="font-semibold text-cyan-300">
                      {formatCurrencyBRL(eta.avgMonthlyAporte)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Rendimento médio/mês</p>
                    <p className="font-semibold text-slate-100">
                      {formatCurrencyBRL(eta.avgMonthlyIncome)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-slate-700/70 bg-slate-900/30 p-2 text-xs">
                  {eta.monthsToTarget === 0 ? (
                    <p className="font-semibold text-emerald-300">Meta já atingida.</p>
                  ) : eta.monthsToTarget === null ? (
                    <p className="font-semibold text-rose-300">
                      Sem projeção de alcance (aporte + rendimento médio ≤ 0).
                    </p>
                  ) : (
                    <p className="font-semibold text-slate-100">
                      Prazo estimado:{" "}
                      <span className="text-cyan-300">{eta.monthsToTarget} mês(es)</span>{" "}
                      • previsão em{" "}
                      <span className="text-cyan-300">
                        {monthLabel(eta.projectedMonth ?? currentMonth)}/{eta.projectedYear ?? currentYear}
                      </span>
                    </p>
                  )}
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
        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
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
                className="w-full rounded-xl border border-slate-800 bg-surface/80 p-4"
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
                  <div className="col-span-2 mt-1 rounded-md border border-slate-700/70 bg-slate-900/30 p-2">
                    <p className="text-slate-400">Necessário por dia útil (restante)</p>
                    {row.gap <= 0 ? (
                      <>
                        <p className="font-semibold text-emerald-300">{formatCurrencyBRL(0)}</p>
                        <p className="text-[11px] text-slate-500">Meta já atingida no mês.</p>
                      </>
                    ) : businessDaysRemaining > 0 ? (
                      <>
                        <p className="font-semibold text-amber-300">
                          {formatCurrencyBRL(row.gap / businessDaysRemaining)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Gap dividido por {businessDaysRemaining} dia(s) útil(eis) restante(s).
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-rose-300">—</p>
                        <p className="text-[11px] text-slate-500">
                          Não há dias úteis restantes neste mês.
                        </p>
                      </>
                    )}
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
            monthlyTrends.map(({ row, series, status }) => {
              const currentPoint = series.find((point) => point.month === currentMonth) ?? null;
              return (
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
                        <ReferenceLine
                          x={currentMonth}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          strokeOpacity={0.95}
                          label={{
                            value: "Mês atual",
                            position: "top",
                            fill: "#f59e0b",
                            fontSize: 10,
                          }}
                        />
                        {currentPoint ? (
                          <ReferenceDot
                            x={currentPoint.month}
                            y={currentPoint.realized}
                            r={4}
                            fill="#f59e0b"
                            stroke="#fef3c7"
                            strokeWidth={1}
                          />
                        ) : null}
                        <XAxis
                          dataKey="month"
                          stroke="#94a3b8"
                          interval={0}
                          minTickGap={0}
                          tick={{ fontSize: 11 }}
                          tickMargin={6}
                          tickFormatter={(value) => monthLabel(Number(value))}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tickFormatter={formatCurrencyBRL}
                          width={80}
                        />
                        <Tooltip
                          formatter={(value: number) => formatCurrencyBRL(value)}
                          labelFormatter={(value) => `Mês: ${monthLabel(Number(value))}`}
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
              );
            })
          )}
        </div>
      </section>

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
    </div>
  );
}
