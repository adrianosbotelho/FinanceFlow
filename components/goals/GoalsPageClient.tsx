"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  GoalAnnualStatus,
  GoalMonthlyStatus,
  GoalsInvestmentRow,
  GoalsOverviewPayload,
} from "../../types";
import {
  formatCurrencyBRL,
  formatPercentage,
  formatPercentageDigits,
  monthLabel,
  monthNameFull,
} from "../../lib/formatters";
import { Card } from "../ui/Card";
import { parseBrNumber } from "../../lib/import-parsers";
import { buildContributionPlan } from "../../lib/goals-plan";

type GoalType = "monthly" | "annual";

const TOOLTIP_STYLE = { backgroundColor: "#020617", borderColor: "#1f2937" };
const INPUT_CLASS =
  "rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const SMALL_BUTTON_CLASS =
  "rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800";
const DANGER_BUTTON_CLASS =
  "rounded-md border border-rose-800/70 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-950/40";

function formatAxisCurrencyTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return value.toFixed(0);
}

// Valor inteiro em reais sem símbolo (ex.: 1.094), para a grade de metas.
function formatWholeReais(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatShortDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

function monthlyStatusBadge(status: GoalMonthlyStatus): { label: string; className: string } {
  if (status === "atingida") return { label: "Atingida", className: "border-emerald-700 text-emerald-300" };
  if (status === "no_ritmo") return { label: "No ritmo", className: "border-cyan-700 text-cyan-300" };
  if (status === "perto") return { label: "Perto da meta", className: "border-amber-700 text-amber-300" };
  if (status === "abaixo") return { label: "Abaixo do ritmo", className: "border-rose-700 text-rose-300" };
  return { label: "Sem meta", className: "border-slate-700 text-slate-400" };
}

function annualStatusBadge(status: GoalAnnualStatus): { label: string; className: string } {
  if (status === "atingida") return { label: "Atingida", className: "border-emerald-700 text-emerald-300" };
  if (status === "no_ritmo") return { label: "No ritmo", className: "border-cyan-700 text-cyan-300" };
  if (status === "abaixo") return { label: "Abaixo do ritmo", className: "border-rose-700 text-rose-300" };
  return { label: "Sem meta", className: "border-slate-700 text-slate-400" };
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function ProgressBar({ value, marker }: { value: number; marker?: number | null }) {
  return (
    <div className="relative h-2 rounded-full bg-slate-800">
      <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      {marker !== undefined && marker !== null ? (
        <div
          className="absolute -top-1 h-4 w-0.5 bg-slate-200"
          style={{ left: `${Math.min(100, Math.max(0, marker))}%` }}
          title="Projeção de fechamento"
        />
      ) : null}
    </div>
  );
}

function ContributionPlanCard({ data }: { data: GoalsOverviewPayload }) {
  const withGoal = data.investments.filter((row) => row.annual.target !== null);
  const recentTotal = data.investments.reduce((acc, row) => acc + Math.max(0, row.annual.recentMonthlyContribution), 0);
  const [budgetRaw, setBudgetRaw] = useState(() => formatCurrencyBRL(recentTotal).replace("R$", "").trim());
  const budget = parseBrNumber(budgetRaw) ?? 0;
  const plan = buildContributionPlan(
    withGoal.map((row) => ({
      id: row.investmentId,
      need: row.annual.requiredMonthlyContribution ?? 0,
      current: Math.max(0, row.annual.recentMonthlyContribution),
      fgcHeadroom: row.fgcHeadroom,
    })),
    budget,
    data.contributionMonthsRemaining,
  );
  const byId = new Map(withGoal.map((row) => [row.investmentId, row]));
  if (withGoal.length === 0) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Plano de aportes até dezembro</h3>
          <p className="text-xs text-slate-400">
            Distribui o aporte mensal pelo que cada meta anual ainda precisa ({data.contributionMonthsRemaining} meses,
            incluindo o atual), sem passar do limite do FGC por instituição.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Aporte por mês (R$)
          <input
            inputMode="decimal"
            value={budgetRaw}
            onChange={(e) => setBudgetRaw(e.target.value)}
            className={`${INPUT_CLASS} w-32 text-right`}
          />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Valor inicial: média dos seus aportes nos últimos 3 meses ({formatCurrencyBRL(recentTotal)}).
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-2">Investimento</th>
              <th className="py-2 text-right">Necessário/mês</th>
              <th className="py-2 text-right">Aportes recentes/mês</th>
              <th className="py-2 text-right">Sugerido/mês</th>
              <th className="py-2 text-right">Mudança</th>
              <th className="py-2 pl-3">Observação</th>
            </tr>
          </thead>
          <tbody>
            {plan.items.map((item) => {
              const row = byId.get(item.id);
              const change = item.suggested - item.current;
              return (
                <tr key={item.id} className="border-t border-slate-800 text-slate-200">
                  <td className="py-2 font-semibold text-slate-100">{row?.label}</td>
                  <td className="py-2 text-right text-amber-300">{formatCurrencyBRL(item.need)}</td>
                  <td className="py-2 text-right text-slate-300">{formatCurrencyBRL(item.current)}</td>
                  <td className="py-2 text-right font-bold text-cyan-300">{formatCurrencyBRL(item.suggested)}</td>
                  <td
                    className={`py-2 text-right ${
                      Math.abs(change) < 1 ? "text-slate-500" : change > 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {Math.abs(change) < 1 ? "—" : `${change > 0 ? "+" : "−"}${formatCurrencyBRL(Math.abs(change))}`}
                  </td>
                  <td className="py-2 pl-3 text-[11px] text-slate-400">
                    {item.need <= 0
                      ? "meta já coberta pelo saldo e rendimento"
                      : item.cappedByFgc
                        ? `limitado pela folga do FGC (${formatCurrencyBRL(Math.max(0, item.fgcHeadroom))})`
                        : item.suggested < item.need - 1
                          ? `cobre ${formatPercentage((item.suggested / item.need) * 100)} do necessário`
                          : "cobre o necessário"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700 font-semibold">
              <td className="py-2 text-slate-300">Total</td>
              <td className="py-2 text-right text-amber-300">{formatCurrencyBRL(plan.totalNeed)}</td>
              <td className="py-2 text-right text-slate-300">
                {formatCurrencyBRL(plan.items.reduce((acc, item) => acc + item.current, 0))}
              </td>
              <td className="py-2 text-right text-cyan-300">{formatCurrencyBRL(plan.allocated)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={`mt-2 text-xs ${plan.shortfall > 1 ? "text-amber-300" : "text-emerald-300"}`}>
        {plan.shortfall > 1
          ? `Faltam ${formatCurrencyBRL(plan.shortfall)}/mês para cobrir todas as metas anuais até dezembro.`
          : plan.leftover > 1
            ? `Metas cobertas; sobram ${formatCurrencyBRL(plan.leftover)}/mês para outros objetivos.`
            : "O aporte cobre exatamente as metas anuais."}
      </p>
    </Card>
  );
}

function MonthlyGoalsGrid({ data, onSaved }: { data: GoalsOverviewPayload; onSaved: () => Promise<void> }) {
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of data.investments) {
      for (const cell of row.months) {
        map[`${row.investmentId}|${cell.month}`] =
          cell.target !== null ? formatCurrencyBRL(cell.target).replace("R$", "").trim() : "";
      }
    }
    return map;
  }, [data]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValues(initial), [initial]);

  const changed = Object.keys(values).filter((key) => {
    const month = Number(key.split("|")[1]);
    return month >= data.month && (values[key] ?? "").trim() !== (initial[key] ?? "").trim();
  });
  const invalid = changed.filter((key) => values[key].trim() !== "" && parseBrNumber(values[key]) === null);

  const copyForward = (investmentId: string) => {
    const source = values[`${investmentId}|${data.month}`] ?? "";
    setValues((prev) => {
      const next = { ...prev };
      for (let m = data.month + 1; m <= 12; m += 1) next[`${investmentId}|${m}`] = source;
      return next;
    });
  };

  const save = async () => {
    if (changed.length === 0 || invalid.length > 0) return;
    setSaving(true);
    const failures: string[] = [];
    for (const key of changed) {
      const [investmentId, monthRaw] = key.split("|");
      const month = Number(monthRaw);
      const raw = values[key].trim();
      try {
        const res = await fetch("/api/investment-goals-monthly", {
          method: raw === "" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            raw === ""
              ? { investment_id: investmentId, year: data.year, month }
              : { investment_id: investmentId, year: data.year, month, monthly_target: parseBrNumber(raw) },
          ),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "erro");
        }
      } catch (err) {
        failures.push(`${monthNameFull(month)}: ${err instanceof Error ? err.message : "erro"}`);
      }
    }
    setSaving(false);
    if (failures.length > 0) alert(`Algumas metas não foram salvas: ${failures.join("; ")}`);
    await onSaved();
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Metas mensais do ano ({data.year})</h3>
          <p className="text-xs text-slate-400">
            Meses fechados: realizado (verde se bateu a meta). Mês atual e seguintes: edite a meta; a borda âmbar indica
            meta acima do que o saldo atual rende na taxa contratada (passe o mouse para ver o valor possível).
          </p>
        </div>
        <button
          type="button"
          disabled={saving || changed.length === 0 || invalid.length > 0}
          onClick={() => void save()}
          className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Salvando..." : `Salvar metas${changed.length > 0 ? ` (${changed.length})` : ""}`}
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-[11px]">
          <thead className="text-slate-400">
            <tr>
              <th className="py-2 pr-2">Investimento</th>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <th key={m} className={`px-1 py-2 text-center ${m === data.month ? "text-cyan-300" : ""}`}>
                  {monthLabel(m)}
                </th>
              ))}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {data.investments.map((row) => (
              <tr key={row.investmentId} className="border-t border-slate-800 align-top">
                <td className="py-2 pr-2 font-semibold text-slate-100">{row.label}</td>
                {row.months.map((cell) => {
                  const key = `${row.investmentId}|${cell.month}`;
                  if (cell.status === "closed") {
                    const hit = cell.target !== null && (cell.realized ?? 0) >= cell.target;
                    return (
                      <td key={cell.month} className="px-1 py-2 text-center">
                        <div
                          className={`font-semibold ${
                            cell.target === null ? "text-slate-300" : hit ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {cell.realized ? formatWholeReais(cell.realized) : "—"}
                        </div>
                        <div className="text-slate-500">
                          {cell.target !== null ? `meta ${formatWholeReais(cell.target)}` : ""}
                        </div>
                      </td>
                    );
                  }
                  const parsed = parseBrNumber(values[key] ?? "");
                  const aboveReach = parsed !== null && cell.possible !== null && parsed > cell.possible * 1.005;
                  return (
                    <td key={cell.month} className="px-1 py-2 text-center">
                      <input
                        inputMode="decimal"
                        value={values[key] ?? ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        title={cell.possible !== null ? `Possível sem novos aportes: ${formatCurrencyBRL(cell.possible)}` : undefined}
                        placeholder={cell.possible !== null ? formatWholeReais(cell.possible) : ""}
                        className={`w-20 rounded border bg-slate-900 px-1 py-1 text-right text-[11px] text-slate-100 outline-none ${
                          values[key]?.trim() && parseBrNumber(values[key]) === null
                            ? "border-rose-500"
                            : aboveReach
                              ? "border-amber-500"
                              : "border-slate-700 focus:border-accent"
                        }`}
                      />
                      {cell.status === "in_progress" ? (
                        <div className="mt-0.5 text-slate-500">real {formatWholeReais(cell.realized ?? 0)}</div>
                      ) : null}
                    </td>
                  );
                })}
                <td className="py-2 pl-1">
                  {data.month < 12 ? (
                    <button
                      type="button"
                      className={SMALL_BUTTON_CLASS}
                      title={`Copiar a meta de ${monthNameFull(data.month)} para os meses seguintes`}
                      onClick={() => copyForward(row.investmentId)}
                    >
                      Copiar →
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        O valor possível usa o saldo atual, o CDI de referência ({formatPercentageDigits(data.cdiAnnualReference, 2)} a.a.), a taxa
        contratada de cada investimento (100% do CDI sem cadastro) e os dias úteis de cada mês. Deixe vazio para
        remover a meta do mês.
      </p>
    </Card>
  );
}

export function GoalsPageClient() {
  const [data, setData] = useState<GoalsOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("monthly");
  const [formInvestmentId, setFormInvestmentId] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [editing, setEditing] = useState<{ type: GoalType; investmentId: string } | null>(null);
  const [balanceFilter, setBalanceFilter] = useState("all");
  const formRef = useRef<HTMLFormElement | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/goals/overview", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao carregar metas.");
      }
      const payload = (await res.json()) as GoalsOverviewPayload;
      setData(payload);
      setFormInvestmentId((prev) => prev || payload.investments[0]?.investmentId || "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar metas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const year = data?.year ?? new Date().getFullYear();
  const month = data?.month ?? new Date().getMonth() + 1;
  const investments = useMemo(() => data?.investments ?? [], [data]);

  const startEdit = (type: GoalType, row: GoalsInvestmentRow) => {
    setEditing({ type, investmentId: row.investmentId });
    setGoalType(type);
    setFormInvestmentId(row.investmentId);
    const current = type === "monthly" ? row.monthly.target : row.annual.target;
    setFormTarget(current ? String(current).replace(".", ",") : "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const cancelEdit = () => {
    setEditing(null);
    setFormTarget("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // "1.100,50", "1100,50" ou "1100.50".
    const target = parseBrNumber(formTarget);
    if (!formInvestmentId) return;
    if (target === null || target < 0) {
      alert(`Meta ${goalType === "monthly" ? "mensal" : "anual"} inválida.`);
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(
        goalType === "monthly" ? "/api/investment-goals-monthly" : "/api/investment-goals-annual",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            goalType === "monthly"
              ? { investment_id: formInvestmentId, year, month, monthly_target: target }
              : { investment_id: formInvestmentId, year, annual_target: target },
          ),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar meta.");
      }
      cancelEdit();
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar meta.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: GoalType, row: GoalsInvestmentRow) => {
    const what = type === "monthly" ? `a meta de ${monthNameFull(month)}` : `a meta anual de ${year}`;
    if (!window.confirm(`Excluir ${what} de ${row.label}?`)) return;
    const res = await fetch(type === "monthly" ? "/api/investment-goals-monthly" : "/api/investment-goals-annual", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        type === "monthly"
          ? { investment_id: row.investmentId, year, month }
          : { investment_id: row.investmentId, year },
      ),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error ?? "Erro ao excluir meta.");
      return;
    }
    if (editing?.type === type && editing.investmentId === row.investmentId) cancelEdit();
    await load();
  };

  const handleRepeatNextMonth = async () => {
    const nextDate = new Date(year, month, 1);
    const toYear = nextDate.getFullYear();
    const toMonth = nextDate.getMonth() + 1;
    const ok = window.confirm(
      `Repetir todas as metas de ${monthNameFull(month)}/${year} para ${monthNameFull(toMonth)}/${toYear}?`,
    );
    if (!ok) return;
    const res = await fetch("/api/investment-goals-monthly/repeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromYear: year, fromMonth: month, toYear, toMonth }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      alert(payload?.error ?? "Erro ao repetir metas.");
      return;
    }
    alert(`Metas repetidas para ${monthNameFull(toMonth)}/${toYear}. Total: ${payload?.copied ?? 0}.`);
  };

  const monthlyChart = (data?.monthlyHistory ?? []).map((point) => ({
    name: `${monthLabel(point.month)}${point.status === "in_progress" ? "*" : ""}`,
    realizado: point.realized,
    projecao: point.projected !== null ? Math.max(0, point.projected - point.realized) : null,
    meta: point.target,
  }));
  const monthlyScore = (data?.monthlyHistory ?? []).filter((point) => point.hit !== null);
  const monthlyHits = monthlyScore.filter((point) => point.hit).length;

  const annualTargets = data?.annualTargets ?? {};
  const balanceTarget =
    balanceFilter === "all"
      ? Object.values(annualTargets).reduce((acc, value) => acc + value, 0)
      : annualTargets[balanceFilter] ?? 0;
  const balanceChart = (data?.balanceHistory ?? []).map((point) => ({
    name: `${monthLabel(point.month)}${point.month === month ? "*" : ""}`,
    saldo:
      balanceFilter === "all"
        ? Object.entries(point.byInvestment)
            .filter(([id]) => (annualTargets[id] ?? 0) > 0)
            .reduce((acc, [, value]) => acc + value, 0)
        : point.byInvestment[balanceFilter] ?? 0,
    meta: balanceTarget > 0 ? balanceTarget : null,
  }));

  const monthly = data?.monthly;
  const annual = data?.annual;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Metas</h2>
        <p className="text-sm text-slate-400">
          Meta mensal de renda e meta anual de patrimônio dos CDBs: onde você está, se está no ritmo e o que falta
          fazer.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-400">Carregando metas...</p> : null}
      {data?.warnings.length ? (
        <Card>
          <ul className="space-y-1 text-xs text-amber-300">
            {data.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {monthly && annual && data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Meta do mês · renda ({monthNameFull(month)}/{year})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Dados até {formatShortDate(data.asOfDate)} · {data.businessDaysRemaining} dia(s) útil(eis) restante(s)
                </p>
              </div>
              <Badge {...monthlyStatusBadge(monthly.status)} />
            </div>
            {monthly.target !== null ? (
              <>
                <p className="mt-3 text-2xl font-bold text-slate-50">
                  {formatCurrencyBRL(monthly.realized)}
                  <span className="text-sm font-normal text-slate-400"> de {formatCurrencyBRL(monthly.target)}</span>
                </p>
                <p className="mb-2 text-xs text-slate-400">
                  {formatPercentage((monthly.realized / monthly.target) * 100)} realizado
                </p>
                <ProgressBar
                  value={(monthly.realized / monthly.target) * 100}
                  marker={(monthly.projected / monthly.target) * 100}
                />
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <p className="text-slate-300">
                    Projeção de fechamento:{" "}
                    <span className="font-semibold text-slate-100">{formatCurrencyBRL(monthly.projected)}</span>{" "}
                    <span className="text-slate-400">({formatPercentage((monthly.projected / monthly.target) * 100)})</span>
                  </p>
                  <p className="text-slate-300">
                    {monthly.realized >= monthly.target ? (
                      "Meta do mês já atingida."
                    ) : monthly.neededPerBusinessDay !== null ? (
                      <>
                        Faltam {formatCurrencyBRL(monthly.target - monthly.realized)}:{" "}
                        <span className="font-semibold text-amber-300">
                          {formatCurrencyBRL(monthly.neededPerBusinessDay)}/dia útil
                        </span>
                      </>
                    ) : (
                      `Faltam ${formatCurrencyBRL(monthly.target - monthly.realized)}; sem dias úteis restantes.`
                    )}
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Nenhuma meta mensal cadastrada para este mês.</p>
            )}
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Meta do ano · patrimônio ({year})</h3>
                <p className="text-[11px] text-slate-500">Soma dos CDBs com meta anual cadastrada</p>
              </div>
              <Badge {...annualStatusBadge(annual.status)} />
            </div>
            {annual.target !== null ? (
              <>
                <p className="mt-3 text-2xl font-bold text-slate-50">
                  {formatCurrencyBRL(annual.balance)}
                  <span className="text-sm font-normal text-slate-400"> de {formatCurrencyBRL(annual.target)}</span>
                </p>
                <p className="mb-2 text-xs text-slate-400">
                  {formatPercentage(annual.progressPercent ?? 0)} · faltam {formatCurrencyBRL(annual.gap)}
                </p>
                <ProgressBar value={annual.progressPercent ?? 0} />
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <p className="text-slate-300">
                    Aporte necessário:{" "}
                    <span className="font-semibold text-amber-300">
                      {formatCurrencyBRL(annual.requiredMonthlyContribution ?? 0)}/mês
                    </span>{" "}
                    <span className="text-slate-400">até dez ({data.contributionMonthsRemaining} meses)</span>
                  </p>
                  <p className="text-slate-300">
                    Seus aportes recentes:{" "}
                    <span className="font-semibold text-slate-100">
                      {formatCurrencyBRL(annual.recentMonthlyContribution)}/mês
                    </span>{" "}
                    <span className="text-slate-400">(média de 3 meses)</span>
                  </p>
                  <p className="text-slate-300">
                    Rendimento esperado até dez:{" "}
                    <span className="font-semibold text-emerald-300">
                      {formatCurrencyBRL(annual.expectedIncomeUntilYearEnd)}
                    </span>
                  </p>
                  <p className="text-slate-300">
                    No ritmo atual, atinge em:{" "}
                    <span className="font-semibold text-slate-100">
                      {annual.eta ? `${monthNameFull(annual.eta.month)}/${annual.eta.year}` : "—"}
                    </span>
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Nenhuma meta anual cadastrada para este ano.</p>
            )}
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Meta do ano · renda ({year})</h3>
                <p className="text-[11px] text-slate-500">
                  {data.annualIncome?.source === "monthly_goals"
                    ? `Soma das metas mensais (${data.annualIncome.monthsWithGoal} meses) · mesmo número do Dashboard`
                    : "Meta anual configurada (sem metas mensais cadastradas)"}
                </p>
              </div>
              {data.annualIncome ? (
                <Badge
                  label={data.annualIncome.onTrack ? "No ritmo" : "Abaixo do ritmo"}
                  className={
                    data.annualIncome.onTrack
                      ? "bg-emerald-900/50 text-emerald-300"
                      : "bg-rose-900/40 text-rose-300"
                  }
                />
              ) : null}
            </div>
            {data.annualIncome && data.annualIncome.annualIncomeTarget > 0 ? (
              <>
                <p className="mt-3 text-2xl font-bold text-slate-50">
                  {formatCurrencyBRL(data.annualIncome.annualProjection)}
                  <span className="text-sm font-normal text-slate-400">
                    {" "}
                    de {formatCurrencyBRL(data.annualIncome.annualIncomeTarget)}
                  </span>
                </p>
                <p className="mb-2 text-xs text-slate-400">
                  projeção nos meses com meta · {formatPercentage(data.annualIncome.progressPercent)}
                </p>
                <ProgressBar value={data.annualIncome.progressPercent} />
                <p className="mt-3 text-xs text-slate-300">
                  {data.annualIncome.gapToTarget > 0
                    ? `Faltam ${formatCurrencyBRL(data.annualIncome.gapToTarget)} na projeção.`
                    : "A projeção cobre a meta do ano."}{" "}
                  <span className="text-slate-500">
                    Realizado nos meses fechados + projeção do mês + ritmo por dia útil nos meses seguintes.
                  </span>
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Sem meta de renda do ano.</p>
            )}
          </Card>
        </div>
      ) : null}

      {data ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Meta mensal por investimento</h3>
          <p className="mb-2 text-xs text-slate-400">
            Realizado em destaque; a projeção considera o ritmo do mês. Renda possível: saldo × CDI do mês na taxa
            contratada, sem novos aportes. Placar: meses fechados do ano em que a meta foi atingida.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2">Investimento</th>
                  <th className="py-2">Meta</th>
                  <th className="py-2">Realizado</th>
                  <th className="py-2">Projeção</th>
                  <th className="py-2">Renda possível</th>
                  <th className="py-2">Necessário/dia útil</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Placar no ano</th>
                  <th className="py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((row) => (
                  <tr key={row.investmentId} className="border-t border-slate-800 text-slate-200">
                    <td className="py-2">
                      <p className="font-semibold text-slate-100">{row.label}</p>
                      <p className="text-[11px] text-slate-500">{row.institution}</p>
                    </td>
                    <td className="py-2">{row.monthly.target === null ? "—" : formatCurrencyBRL(row.monthly.target)}</td>
                    <td className="py-2 font-semibold">
                      {formatCurrencyBRL(row.monthly.realized)}
                      {row.monthly.target ? (
                        <span className="ml-1 text-[10px] font-normal text-slate-500">
                          ({formatPercentage((row.monthly.realized / row.monthly.target) * 100)})
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-slate-300">{formatCurrencyBRL(row.monthly.projected)}</td>
                    <td className="py-2">
                      <span className="text-slate-300">{formatCurrencyBRL(row.possibleMonthlyIncome)}</span>
                      <span className="block text-[10px] text-slate-500">
                        {row.contractedCdiPercent !== null
                          ? `${Math.round(row.contractedCdiPercent)}% do CDI`
                          : "100% do CDI (sem cadastro)"}
                      </span>
                      {row.monthlyTargetReachable === false && row.balanceForMonthlyTarget !== null ? (
                        <span className="block text-[10px] text-amber-300">
                          Meta acima do que o saldo rende: precisa de {formatCurrencyBRL(row.balanceForMonthlyTarget)} de
                          saldo
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-amber-300">
                      {row.monthly.neededPerBusinessDay ? formatCurrencyBRL(row.monthly.neededPerBusinessDay) : "—"}
                    </td>
                    <td className="py-2">
                      <Badge {...monthlyStatusBadge(row.monthly.status)} />
                    </td>
                    <td className="py-2 text-slate-300">
                      {row.monthlyGoalMonths > 0 ? `${row.monthlyHits} de ${row.monthlyGoalMonths}` : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button type="button" className={SMALL_BUTTON_CLASS} onClick={() => startEdit("monthly", row)}>
                          {row.monthly.target === null ? "Definir" : "Editar"}
                        </button>
                        {row.monthly.target !== null ? (
                          <button
                            type="button"
                            className={DANGER_BUTTON_CLASS}
                            onClick={() => void handleDelete("monthly", row)}
                          >
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {data ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Meta anual de patrimônio por investimento</h3>
          <p className="mb-2 text-xs text-slate-400">
            Aporte necessário = (falta − rendimento esperado até dezembro) ÷ meses restantes, incluindo o atual. Prazo
            no ritmo atual = aportes médios dos últimos 3 meses + renda do mês.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2">Investimento</th>
                  <th className="py-2">Meta</th>
                  <th className="py-2">Saldo atual</th>
                  <th className="py-2">Progresso</th>
                  <th className="py-2">Falta</th>
                  <th className="py-2">Aporte necessário/mês</th>
                  <th className="py-2">Aportes recentes/mês</th>
                  <th className="py-2">Atinge em</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((row) => (
                  <tr key={row.investmentId} className="border-t border-slate-800 text-slate-200">
                    <td className="py-2">
                      <p className="font-semibold text-slate-100">{row.label}</p>
                      <p className="text-[11px] text-slate-500">{row.institution}</p>
                    </td>
                    <td className="py-2">{row.annual.target === null ? "—" : formatCurrencyBRL(row.annual.target)}</td>
                    <td className="py-2 font-semibold">{formatCurrencyBRL(row.annual.balance)}</td>
                    <td className="py-2">
                      {row.annual.progressPercent === null ? (
                        "—"
                      ) : (
                        <div className="w-24 space-y-1">
                          <span>{formatPercentage(row.annual.progressPercent)}</span>
                          <ProgressBar value={row.annual.progressPercent} />
                        </div>
                      )}
                    </td>
                    <td className="py-2">{row.annual.target === null ? "—" : formatCurrencyBRL(row.annual.gap)}</td>
                    <td className="py-2 font-semibold text-amber-300">
                      {row.annual.requiredMonthlyContribution === null
                        ? "—"
                        : formatCurrencyBRL(row.annual.requiredMonthlyContribution)}
                    </td>
                    <td className="py-2 text-slate-300">{formatCurrencyBRL(row.annual.recentMonthlyContribution)}</td>
                    <td className="py-2 text-slate-300">
                      {row.annual.eta ? `${monthLabel(row.annual.eta.month)}/${row.annual.eta.year}` : "—"}
                    </td>
                    <td className="py-2">
                      <Badge {...annualStatusBadge(row.annual.status)} />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button type="button" className={SMALL_BUTTON_CLASS} onClick={() => startEdit("annual", row)}>
                          {row.annual.target === null ? "Definir" : "Editar"}
                        </button>
                        {row.annual.target !== null ? (
                          <button
                            type="button"
                            className={DANGER_BUTTON_CLASS}
                            onClick={() => void handleDelete("annual", row)}
                          >
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {data ? <ContributionPlanCard key={`${data.year}-${data.month}`} data={data} /> : null}

      {data ? <MonthlyGoalsGrid data={data} onSaved={load} /> : null}

      {data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-200">Histórico da meta mensal ({year})</h3>
            <p className="mb-2 text-xs text-slate-400">
              Renda realizada (barras) vs meta (linha).{" "}
              {monthlyScore.length > 0
                ? `Meta atingida em ${monthlyHits} de ${monthlyScore.length} meses fechados com meta.`
                : "Sem meses fechados com meta."}{" "}
              * mês em andamento, com a projeção em cinza.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyChart} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatAxisCurrencyTick} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [
                      formatCurrencyBRL(value),
                      name === "meta" ? "Meta" : name === "projecao" ? "Projeção (restante)" : "Realizado",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value: string) =>
                      value === "meta" ? "Meta" : value === "projecao" ? "Projeção do mês" : "Realizado"
                    }
                  />
                  <Bar dataKey="realizado" name="realizado" stackId="renda" fill="#22d3ee" />
                  <Bar dataKey="projecao" name="projecao" stackId="renda" fill="#475569" fillOpacity={0.6} />
                  <Line type="stepAfter" dataKey="meta" name="meta" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Patrimônio vs meta anual ({year})</h3>
                <p className="text-xs text-slate-400">Saldo no fim de cada mês (aportes + rendimento) vs a meta.</p>
              </div>
              <select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)} className={INPUT_CLASS}>
                <option value="all">CDBs com meta anual</option>
                {investments.map((row) => (
                  <option key={row.investmentId} value={row.investmentId}>
                    {row.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={balanceChart} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatAxisCurrencyTick} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [
                      formatCurrencyBRL(value),
                      name === "meta" ? "Meta anual" : "Saldo",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value: string) => (value === "meta" ? "Meta anual" : "Saldo")}
                  />
                  <Line type="monotone" dataKey="saldo" name="saldo" stroke="#22d3ee" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="meta"
                    name="meta"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : null}

      {data ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Gerenciar metas</h3>
              <p className="text-xs text-slate-400">
                Metas mensais valem para {monthNameFull(month)}/{year}; metas anuais, para {year}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRepeatNextMonth()}
              className="rounded-md border border-cyan-800 bg-cyan-950/20 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-900/30"
            >
              Repetir metas mensais para o mês seguinte
            </button>
          </div>
          <form ref={formRef} onSubmit={handleSave} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Tipo de meta</label>
              <select
                value={goalType}
                onChange={(e) => {
                  setGoalType(e.target.value as GoalType);
                  cancelEdit();
                }}
                className={INPUT_CLASS}
              >
                <option value="monthly">Mensal (renda)</option>
                <option value="annual">Anual (patrimônio)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Investimento (CDB)</label>
              <select
                value={formInvestmentId}
                onChange={(e) => setFormInvestmentId(e.target.value)}
                className={INPUT_CLASS}
              >
                {investments.map((row) => (
                  <option key={row.investmentId} value={row.investmentId}>
                    {row.label} ({row.institution})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">
                {goalType === "monthly" ? "Meta mensal (R$)" : "Meta anual de patrimônio (R$)"}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder={goalType === "monthly" ? "800,00" : "100000,00"}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-8 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white shadow-sm hover:bg-accent-soft disabled:opacity-60"
              >
                {saving ? "Salvando..." : editing ? "Salvar alteração" : "Salvar meta"}
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-700 px-4 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
