"use client";

import { useEffect, useState } from "react";
import { GoalRow, Investment } from "@/types";
import { formatCurrency, monthName } from "@/lib/format";

function formatProgress(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function progressTone(progress: number | null): string {
  if (progress === null || Number.isNaN(progress)) return "text-slate-300";
  if (progress >= 100) return "text-emerald-300";
  if (progress >= 70) return "text-cyan-300";
  if (progress >= 40) return "text-amber-300";
  return "text-rose-300";
}

export function MetasClient({ initialYear, envReady }: { initialYear: number; envReady: boolean }) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  const [formInvestmentId, setFormInvestmentId] = useState("");
  const [formType, setFormType] = useState<"monthly" | "annual">("monthly");
  const [formTarget, setFormTarget] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [goalsRes, invRes] = await Promise.all([
      fetch(`/api/goals?year=${year}&month=${month}`, { cache: "no-store" }),
      fetch("/api/investments", { cache: "no-store" }),
    ]);
    const g = goalsRes.ok ? ((await goalsRes.json()) as GoalRow[]) : [];
    const inv = invRes.ok ? ((await invRes.json()) as Investment[]) : [];
    setGoals(g);
    setInvestments(inv);
    if (!formInvestmentId && inv.length > 0) setFormInvestmentId(inv[0].id);
    setLoading(false);
  }

  useEffect(() => {
    if (!envReady) {
      setLoading(false);
      return;
    }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, envReady]);

  const monthly = goals.filter((r) => r.type === "monthly");
  const annual = goals.filter((r) => r.type === "annual");

  async function handleSave() {
    if (!formInvestmentId || !formTarget) return;
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investment_id: formInvestmentId,
          type: formType,
          year,
          month: formType === "monthly" ? month : undefined,
          target: Number(formTarget.replace(",", ".")),
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar meta");
      setFormTarget("");
      await loadAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g: GoalRow) {
    if (!confirm(`Excluir meta de ${g.investment_label}?`)) return;
    const params = new URLSearchParams({
      investment_id: g.investment_id,
      type: g.type,
      year: String(g.year),
    });
    if (g.month !== null) params.set("month", String(g.month));
    await fetch(`/api/goals?${params.toString()}`, { method: "DELETE" });
    await loadAll();
  }

  if (!envReady) {
    return (
      <div className="card">
        <h1 className="text-lg font-bold">Metas</h1>
        <p className="mt-2 text-sm text-slate-400">Configure as variáveis do Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Metas</h1>
        <p className="text-sm text-slate-400">Gerencie metas mensais e anuais.</p>
      </header>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Mês</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{monthName(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Ano</label>
            <input
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-20 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <h3 className="mb-2 text-sm font-semibold">Nova meta</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={formInvestmentId}
            onChange={(e) => setFormInvestmentId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          >
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.type} • {inv.institution}</option>
            ))}
          </select>
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value as "monthly" | "annual")}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="monthly">Mensal</option>
            <option value="annual">Anual (capital)</option>
          </select>
          <input
            value={formTarget}
            onChange={(e) => setFormTarget(e.target.value)}
            placeholder="Valor da meta (R$)"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:bg-slate-700"
          >
            {saving ? "Salvando..." : "Salvar meta"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Metas mensais ({monthName(month)}/{year})</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : monthly.length === 0 ? (
          <p className="text-sm text-slate-400">Sem metas mensais para o período.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {monthly.map((g) => (
              <div key={`m-${g.investment_id}`} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{g.investment_label}</p>
                    <p className="text-cyan-300">Meta: {formatCurrency(g.target)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">Atual</p>
                    <p className="font-semibold text-slate-100">{formatCurrency(g.current_value)}</p>
                    <p className={`text-xs font-semibold ${progressTone(g.progress_pct)}`}>
                      {formatProgress(g.progress_pct)} atingido
                    </p>
                    <button
                      onClick={() => void handleDelete(g)}
                      className="mt-1 rounded-md border border-rose-700 px-2 py-0.5 text-[11px] text-rose-200 hover:bg-rose-900/30"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Metas anuais ({year})</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : annual.length === 0 ? (
          <p className="text-sm text-slate-400">Sem metas anuais para o período.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {annual.map((g) => (
              <div key={`a-${g.investment_id}`} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{g.investment_label}</p>
                    <p className="text-cyan-300">Meta anual: {formatCurrency(g.target)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">Atual</p>
                    <p className="font-semibold text-slate-100">{formatCurrency(g.current_value)}</p>
                    <p className={`text-xs font-semibold ${progressTone(g.progress_pct)}`}>
                      {formatProgress(g.progress_pct)} atingido
                    </p>
                    <button
                      onClick={() => void handleDelete(g)}
                      className="mt-1 rounded-md border border-rose-700 px-2 py-0.5 text-[11px] text-rose-200 hover:bg-rose-900/30"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
