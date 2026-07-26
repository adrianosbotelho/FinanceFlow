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

  const [cashEvents, setCashEvents] = useState<Array<{ id: string; investment_id: string; event_date: string; type: string; amount: number; notes?: string | null }>>([]);
  const [eventInvestmentId, setEventInvestmentId] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventType, setEventType] = useState<string>("APORTE");
  const [eventAmount, setEventAmount] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [eventSaving, setEventSaving] = useState(false);

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
    const [invRes, retRes, eventsRes] = await Promise.all([
      fetch("/api/investments", { cache: "no-store" }),
      fetch(`/api/returns?year=${selectedYear}`, { cache: "no-store" }),
      fetch(`/api/cash-events?year=${selectedYear}`, { cache: "no-store" }),
    ]);
    const inv = invRes.ok ? ((await invRes.json()) as Investment[]) : [];
    const ret = retRes.ok ? ((await retRes.json()) as ReturnRow[]) : [];
    const events = eventsRes.ok ? await eventsRes.json() : [];
    setInvestments(inv);
    setRows(ret);
    setCashEvents(Array.isArray(events) ? events : []);
    if (!investmentId && inv.length > 0) setInvestmentId(inv[0].id);
    if (!eventInvestmentId && inv.length > 0) setEventInvestmentId(inv[0].id);
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

  const monthlySummary = useMemo(() => {
    const cdbInvestments = investments.filter((inv) => inv.type === "CDB");
    const months = new Map<number, { month: number; cdbValues: Map<string, number>; fiis: number; total: number }>();

    for (const r of rows) {
      const inv = investments.find((i) => i.id === r.investment_id);
      if (!inv) continue;
      let entry = months.get(r.month);
      if (!entry) {
        entry = { month: r.month, cdbValues: new Map(), fiis: 0, total: 0 };
        months.set(r.month, entry);
      }
      const income = Number(r.income_value ?? 0);
      if (inv.type === "CDB") {
        entry.cdbValues.set(inv.id, (entry.cdbValues.get(inv.id) ?? 0) + income);
      } else {
        entry.fiis += income;
      }
      entry.total = Array.from(entry.cdbValues.values()).reduce((a, b) => a + b, 0) + entry.fiis;
    }

    return {
      cdbInvestments,
      months: Array.from(months.values()).sort((a, b) => a.month - b.month),
    };
  }, [rows, investments]);

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

      {!loading && monthlySummary.months.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Resumo mensal consolidado</h2>
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-2 py-2">Mês</th>
                {monthlySummary.cdbInvestments.map((inv) => (
                  <th key={inv.id} className="px-2 py-2 text-amber-300">
                    CDB {inv.institution}
                  </th>
                ))}
                <th className="px-2 py-2 text-emerald-300">FIIs</th>
                <th className="px-2 py-2 font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.months.map((entry) => (
                <tr key={entry.month} className="border-b border-slate-800/70 last:border-0">
                  <td className="px-2 py-2 text-slate-200">{monthName(entry.month)}</td>
                  {monthlySummary.cdbInvestments.map((inv) => (
                    <td key={inv.id} className="px-2 py-2 text-amber-300">
                      {formatCurrency(entry.cdbValues.get(inv.id) ?? 0)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-emerald-300">{formatCurrency(entry.fiis)}</td>
                  <td className="px-2 py-2 font-bold text-slate-100">{formatCurrency(entry.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Eventos de caixa ({year})</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Investimento</label>
            <select
              value={eventInvestmentId}
              onChange={(e) => setEventInvestmentId(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              disabled={!envReady}
            >
              {investments.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.type} • {inv.institution}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Data</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              disabled={!envReady}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Tipo</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              disabled={!envReady}
            >
              <option value="APORTE">Aporte</option>
              <option value="RESGATE">Resgate</option>
              <option value="IMPOSTO">Imposto</option>
              <option value="TAXA">Taxa</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Valor (R$)</label>
            <input
              value={eventAmount}
              onChange={(e) => setEventAmount(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              placeholder="0,00"
              disabled={!envReady}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Obs (opcional)</label>
            <input
              value={eventNotes}
              onChange={(e) => setEventNotes(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              disabled={!envReady}
            />
          </div>
        </div>
        <button
          onClick={async () => {
            if (!eventInvestmentId || !eventDate || !eventAmount) return;
            setEventSaving(true);
            try {
              const parsed = parseIncomeInput(eventAmount);
              if (parsed === null) return;
              const res = await fetch("/api/cash-events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  investment_id: eventInvestmentId,
                  event_date: eventDate,
                  type: eventType,
                  amount: parsed,
                  notes: eventNotes || null,
                }),
              });
              if (!res.ok) throw new Error("Falha ao salvar evento");
              setEventAmount("");
              setEventNotes("");
              await loadAll(year);
            } catch (e) {
              alert(e instanceof Error ? e.message : "Erro");
            } finally {
              setEventSaving(false);
            }
          }}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:bg-slate-700"
          disabled={!envReady || eventSaving}
        >
          {eventSaving ? "Salvando..." : "Registrar evento"}
        </button>

        {cashEvents.length > 0 && (
          <div className="mt-4 space-y-2">
            {cashEvents.slice(0, 10).map((ev) => {
              const inv = investments.find((i) => i.id === ev.investment_id);
              return (
                <div key={ev.id} className="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2">
                  <div>
                    <p className="text-xs text-slate-300">
                      {ev.event_date} • {inv ? `${inv.name} (${inv.institution})` : "-"} • <span className="font-semibold text-indigo-300">{ev.type}</span>
                    </p>
                    <p className="text-sm font-bold text-slate-100">{formatCurrency(ev.amount)}</p>
                    {ev.notes && <p className="text-xs text-slate-500">{ev.notes}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm("Excluir evento?")) return;
                      await fetch(`/api/cash-events?id=${ev.id}`, { method: "DELETE" });
                      await loadAll(year);
                    }}
                    className="rounded-md border border-rose-700 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30"
                  >
                    Excluir
                  </button>
                </div>
              );
            })}
            {cashEvents.length > 10 && (
              <p className="text-xs text-slate-500">Mostrando 10 de {cashEvents.length} eventos.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
