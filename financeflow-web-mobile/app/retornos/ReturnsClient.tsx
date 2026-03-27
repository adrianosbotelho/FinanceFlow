"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ReturnRow, Investment } from "@/types";
import { formatCurrency, monthName } from "@/lib/format";

export function ReturnsClient({ initialYear, envReady }: { initialYear: number; envReady: boolean }) {
  const [year, setYear] = useState(initialYear);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  const [investmentId, setInvestmentId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [incomeValue, setIncomeValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLElement | null>(null);
  const incomeInputRef = useRef<HTMLInputElement | null>(null);

  function parseIncomeInput(raw: string): number | null {
    const cleaned = raw.trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
    if (!cleaned) return null;
    let normalized = cleaned;
    if (normalized.includes(",") && normalized.includes(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (normalized.includes(",")) {
      normalized = normalized.replace(",", ".");
    }
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  async function loadAll(selectedYear: number) {
    setLoading(true);
    const [invRes, retRes] = await Promise.all([
      fetch("/api/investments", { cache: "no-store" }),
      fetch(`/api/returns?year=${selectedYear}`, { cache: "no-store" }),
    ]);
    const inv = invRes.ok ? ((await invRes.json()) as Investment[]) : [];
    const ret = retRes.ok ? ((await retRes.json()) as ReturnRow[]) : [];
    setInvestments(inv);
    setRows(ret);
    if (!investmentId && inv.length > 0) setInvestmentId(inv[0].id);
    setLoading(false);
  }

  useEffect(() => {
    if (!envReady) {
      setLoading(false);
      return;
    }
    void loadAll(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, envReady]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return a.investment_label.localeCompare(b.investment_label, "pt-BR");
    });
  }, [rows]);

  const totals = useMemo(() => {
    return sortedRows.reduce(
      (acc, r) => {
        acc.total += Number(r.income_value ?? 0);
        return acc;
      },
      { total: 0 },
    );
  }, [sortedRows]);

  async function save() {
    if (!envReady) return;
    if (!investmentId) {
      setFormError("Selecione um investimento.");
      return;
    }
    const parsedIncome = parseIncomeInput(incomeValue);
    if (parsedIncome === null) {
      setFormError("Informe um valor valido para o rendimento.");
      return;
    }
    setFormError(null);
    setSaving(true);
    const payload = {
      investment_id: investmentId,
      month,
      year,
      income_value: parsedIncome,
    };

    try {
      let response: Response;
      if (editingId) {
        response = await fetch(`/api/returns/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ income_value: payload.income_value }),
        });
      } else {
        response = await fetch("/api/returns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setIncomeValue("");
      setEditingId(null);
      await loadAll(year);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Falha ao salvar/atualizar.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: ReturnRow) {
    setEditingId(row.id);
    setIncomeValue(String(row.income_value));
    setMonth(row.month);
    setInvestmentId(row.investment_id);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => incomeInputRef.current?.focus(), 200);
    });
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Retornos Mensais</h1>
        <p className="text-sm text-slate-400">Atualize rendimentos pelo celular.</p>
      </header>

      {!envReady ? (
        <section className="card">
          <p className="text-sm text-slate-300">
            Configure as variaveis do Supabase para habilitar leitura e edicao de retornos.
          </p>
        </section>
      ) : null}

      <section ref={formRef} className="card">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Ano</label>
            <input
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              disabled={!envReady}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Investimento</label>
            <select
              value={investmentId}
              onChange={(e) => setInvestmentId(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              disabled={!envReady}
            >
              {investments.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.type} • {inv.institution} • {inv.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Mês</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              disabled={!envReady}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Rendimento (R$)</label>
            <input
              ref={incomeInputRef}
              value={incomeValue}
              onChange={(e) => setIncomeValue(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              placeholder="0,00"
              disabled={!envReady}
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => void save()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            disabled={!envReady || saving}
          >
            {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
          </button>
          {editingId ? (
            <button
              onClick={() => {
                setEditingId(null);
                setIncomeValue("");
              }}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm"
            >
              Cancelar
            </button>
          ) : null}
        </div>
        {formError ? <p className="mt-2 text-xs text-rose-300">{formError}</p> : null}
      </section>

      <section className="card">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-sm font-semibold">Histórico {year}</h2>
          <p className="text-sm text-slate-300">Total: {formatCurrency(totals.total)}</p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : sortedRows.length === 0 ? (
          <p className="text-sm text-slate-400">Sem lançamentos no ano.</p>
        ) : (
          <div className="space-y-2">
            {sortedRows.map((r) => (
              <article key={r.id} className="rounded-lg border border-slate-700 p-3">
                <p className="text-sm font-semibold text-slate-100">{r.investment_label}</p>
                <p className="text-xs text-slate-400">
                  {monthName(r.month)} / {r.year}
                </p>
                <p className="mt-1 text-lg font-bold text-emerald-300">{formatCurrency(r.income_value)}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => startEdit(r)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs"
                  >
                    Editar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
