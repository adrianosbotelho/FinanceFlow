"use client";

// Mesmos blocos da página de Metas do desktop (meta de renda do ano, renda possível, plano de
// aportes e metas mensais do ano), em cartões para telas pequenas. Dados de /api/goals/overview.
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoalsOverviewPayload } from "@/types";
import { formatCurrency, monthLabel, monthName } from "@/lib/format";
import { parseBrNumber } from "@/lib/finance/br-number";
import { buildContributionPlan } from "@/lib/finance/goals-plan";

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

function whole(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function inputValue(value: number | null): string {
  return value === null ? "" : formatCurrency(value).replace("R$", "").trim();
}

export function GoalsPlanning({ reloadToken, onChanged }: { reloadToken: number; onChanged: () => void }) {
  const [data, setData] = useState<GoalsOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/goals/overview", { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Erro ao carregar o planejamento de metas.");
      setData(payload as GoalsOverviewPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar o planejamento de metas.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  if (error) return <p className="text-xs text-rose-300">{error}</p>;
  if (!data) return <p className="text-xs text-slate-400">Carregando planejamento...</p>;

  return (
    <div className="space-y-5">
      <AnnualIncomeCard data={data} />
      <PossibleIncomeCard data={data} />
      <ContributionPlanCard key={`${data.year}-${data.month}`} data={data} />
      <YearGoalsCard
        data={data}
        onSaved={async () => {
          await load();
          onChanged();
        }}
      />
    </div>
  );
}

function AnnualIncomeCard({ data }: { data: GoalsOverviewPayload }) {
  const goal = data.annualIncome;
  if (!goal || goal.annualIncomeTarget <= 0) return null;
  const progress = Math.min(100, goal.progressPercent);
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Meta do ano · renda ({data.year})</h2>
          <p className="text-[11px] text-slate-500">
            {goal.source === "monthly_goals"
              ? `Soma das metas mensais (${goal.monthsWithGoal} meses)`
              : "Meta anual configurada"}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            goal.onTrack ? "bg-emerald-900/50 text-emerald-300" : "bg-rose-900/40 text-rose-300"
          }`}
        >
          {goal.onTrack ? "No ritmo" : "Abaixo do ritmo"}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold text-slate-50">
        {formatCurrency(goal.annualProjection)}
        <span className="text-xs font-normal text-slate-400"> de {formatCurrency(goal.annualIncomeTarget)}</span>
      </p>
      <div className="mt-2 h-2 rounded-full bg-slate-800">
        <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Projeção nos meses com meta: {pct(goal.progressPercent)}.{" "}
        {goal.gapToTarget > 0 ? `Faltam ${formatCurrency(goal.gapToTarget)}.` : "Cobre a meta do ano."}
      </p>
    </section>
  );
}

function PossibleIncomeCard({ data }: { data: GoalsOverviewPayload }) {
  const rows = data.investments.filter((row) => row.monthly.target !== null);
  if (rows.length === 0) return null;
  return (
    <section className="card">
      <h2 className="text-sm font-semibold text-slate-100">Renda possível ({monthName(data.month)})</h2>
      <p className="mb-3 text-[11px] text-slate-500">
        Saldo × CDI do mês na taxa contratada, sem novos aportes. Mostra se a meta cabe no que o saldo rende.
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.investmentId} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-100">{row.label}</p>
                <p className="text-[11px] text-slate-500">
                  {row.contractedCdiPercent !== null ? `${Math.round(row.contractedCdiPercent)}% do CDI` : "100% do CDI (sem cadastro)"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-slate-400">
                  meta <span className="font-semibold text-slate-100">{formatCurrency(row.monthly.target)}</span>
                </p>
                <p className="text-slate-400">
                  possível <span className="font-semibold text-cyan-300">{formatCurrency(row.possibleMonthlyIncome)}</span>
                </p>
              </div>
            </div>
            {row.monthlyTargetReachable === false && row.balanceForMonthlyTarget !== null ? (
              <p className="mt-2 text-[11px] text-amber-300">
                ⚠ Meta acima do que o saldo rende: precisa de {formatCurrency(row.balanceForMonthlyTarget)} de saldo.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ContributionPlanCard({ data }: { data: GoalsOverviewPayload }) {
  const withGoal = data.investments.filter((row) => row.annual.target !== null);
  const recentTotal = data.investments.reduce((acc, row) => acc + Math.max(0, row.annual.recentMonthlyContribution), 0);
  const [budgetRaw, setBudgetRaw] = useState(() => inputValue(recentTotal));
  const budget = parseBrNumber(budgetRaw) ?? 0;
  if (withGoal.length === 0) return null;
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
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Plano de aportes até dezembro</h2>
        <p className="text-[11px] text-slate-500">
          Reparte o aporte mensal pelo que cada meta anual precisa ({data.contributionMonthsRemaining} meses), sem passar
          do FGC por instituição.
        </p>
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
        Aporte por mês (R$)
        <input
          inputMode="decimal"
          value={budgetRaw}
          onChange={(e) => setBudgetRaw(e.target.value)}
          className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-right text-base text-slate-100"
        />
      </label>
      <p className="text-[11px] text-slate-500">Valor inicial: média dos aportes dos últimos 3 meses.</p>
      <div className="space-y-2">
        {plan.items.map((item) => {
          const change = item.suggested - item.current;
          return (
            <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-100">{byId.get(item.id)?.label}</p>
                <p className="text-right font-bold text-cyan-300">{formatCurrency(item.suggested)}/mês</p>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                precisa {formatCurrency(item.need)} · recebendo {formatCurrency(item.current)}
                {Math.abs(change) >= 1 ? (
                  <span className={change > 0 ? "text-emerald-300" : "text-rose-300"}>
                    {" "}
                    ({change > 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(change))})
                  </span>
                ) : null}
              </p>
              {item.cappedByFgc ? (
                <p className="mt-1 text-[11px] text-amber-300">Limitado pela folga do FGC.</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className={`text-xs ${plan.shortfall > 1 ? "text-amber-300" : "text-emerald-300"}`}>
        {plan.shortfall > 1
          ? `Faltam ${formatCurrency(plan.shortfall)}/mês para cobrir todas as metas anuais.`
          : plan.leftover > 1
            ? `Metas cobertas; sobram ${formatCurrency(plan.leftover)}/mês.`
            : "O aporte cobre exatamente as metas anuais."}
      </p>
    </section>
  );
}

function YearGoalsCard({ data, onSaved }: { data: GoalsOverviewPayload; onSaved: () => Promise<void> }) {
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of data.investments) {
      for (const cell of row.months) map[`${row.investmentId}|${cell.month}`] = inputValue(cell.target);
    }
    return map;
  }, [data]);
  const [values, setValues] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValues(initial), [initial]);

  const changed = Object.keys(values).filter(
    (key) => Number(key.split("|")[1]) >= data.month && (values[key] ?? "").trim() !== (initial[key] ?? "").trim(),
  );
  const invalid = changed.some((key) => values[key].trim() !== "" && parseBrNumber(values[key]) === null);

  const copyForward = (investmentId: string) => {
    const source = values[`${investmentId}|${data.month}`] ?? "";
    setValues((prev) => {
      const next = { ...prev };
      for (let m = data.month + 1; m <= 12; m += 1) next[`${investmentId}|${m}`] = source;
      return next;
    });
  };

  const save = async () => {
    if (changed.length === 0 || invalid) return;
    setSaving(true);
    const failures: string[] = [];
    for (const key of changed) {
      const [investmentId, monthRaw] = key.split("|");
      const raw = values[key].trim();
      try {
        const res =
          raw === ""
            ? await fetch(
                `/api/goals?${new URLSearchParams({
                  investment_id: investmentId,
                  type: "monthly",
                  year: String(data.year),
                  month: monthRaw,
                }).toString()}`,
                { method: "DELETE" },
              )
            : await fetch("/api/goals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  investment_id: investmentId,
                  type: "monthly",
                  year: data.year,
                  month: Number(monthRaw),
                  target: parseBrNumber(raw),
                }),
              });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "erro");
        }
      } catch (err) {
        failures.push(`${monthName(Number(monthRaw))}: ${err instanceof Error ? err.message : "erro"}`);
      }
    }
    setSaving(false);
    if (failures.length > 0) alert(`Algumas metas não foram salvas: ${failures.join("; ")}`);
    await onSaved();
  };

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Metas mensais do ano ({data.year})</h2>
        <p className="text-[11px] text-slate-500">
          Toque num investimento para ver o realizado dos meses fechados e editar as metas do mês atual em diante. Borda
          âmbar: meta acima do que o saldo rende.
        </p>
      </div>
      <div className="space-y-2">
        {data.investments.map((row) => {
          const open = openId === row.investmentId;
          const closedWithGoal = row.months.filter((cell) => cell.status === "closed" && cell.target !== null);
          const hits = closedWithGoal.filter((cell) => (cell.realized ?? 0) >= (cell.target ?? 0)).length;
          return (
            <div key={row.investmentId} className="rounded-xl border border-slate-700 bg-slate-900/40">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : row.investmentId)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
              >
                <span className="font-semibold text-slate-100">{row.label}</span>
                <span className="text-slate-400">
                  {closedWithGoal.length > 0 ? `bateu ${hits} de ${closedWithGoal.length}` : "sem histórico"} {open ? "▲" : "▼"}
                </span>
              </button>
              {open ? (
                <div className="space-y-1 border-t border-slate-800 px-3 py-2">
                  {row.months.map((cell) => {
                    const key = `${row.investmentId}|${cell.month}`;
                    if (cell.status === "closed") {
                      const hit = cell.target !== null && (cell.realized ?? 0) >= cell.target;
                      return (
                        <div key={cell.month} className="flex items-center justify-between text-[11px]">
                          <span className="w-10 text-slate-500">{monthLabel(cell.month)}</span>
                          <span className={cell.target === null ? "text-slate-300" : hit ? "text-emerald-300" : "text-rose-300"}>
                            {cell.realized ? whole(cell.realized) : "—"}
                          </span>
                          <span className="w-24 text-right text-slate-500">
                            {cell.target !== null ? `meta ${whole(cell.target)}` : ""}
                          </span>
                        </div>
                      );
                    }
                    const parsed = parseBrNumber(values[key] ?? "");
                    const above = parsed !== null && cell.possible !== null && parsed > cell.possible * 1.005;
                    return (
                      <div key={cell.month} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className={`w-10 ${cell.status === "in_progress" ? "text-cyan-300" : "text-slate-400"}`}>
                          {monthLabel(cell.month)}
                        </span>
                        <span className="flex-1 text-slate-500">
                          {cell.possible !== null ? `possível ${whole(cell.possible)}` : ""}
                        </span>
                        <input
                          inputMode="decimal"
                          value={values[key] ?? ""}
                          onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                          className={`w-28 rounded-lg border bg-slate-950 px-2 py-1.5 text-right text-sm text-slate-100 ${
                            values[key]?.trim() && parsed === null
                              ? "border-rose-500"
                              : above
                                ? "border-amber-500"
                                : "border-slate-700"
                          }`}
                        />
                      </div>
                    );
                  })}
                  {data.month < 12 ? (
                    <button
                      type="button"
                      onClick={() => copyForward(row.investmentId)}
                      className="mt-1 w-full rounded-lg border border-slate-700 py-1.5 text-[11px] text-slate-200"
                    >
                      Copiar meta de {monthName(data.month)} para os meses seguintes
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || changed.length === 0 || invalid}
        className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {saving ? "Salvando..." : `Salvar metas${changed.length > 0 ? ` (${changed.length})` : ""}`}
      </button>
      <p className="text-[11px] text-slate-500">
        Possível: saldo atual, CDI de referência ({pct(data.cdiAnnualReference, 2)} a.a.), taxa contratada e dias úteis de
        cada mês. Deixe vazio para remover a meta do mês.
      </p>
    </section>
  );
}
