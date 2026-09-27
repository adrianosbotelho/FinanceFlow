"use client";

// Mesmo "Lançamento rápido" da página de Retornos do desktop, em cartões para telas pequenas.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReturnsPacePayload } from "@/types";
import { formatCurrency, monthName } from "@/lib/format";
import { previousBusinessDay } from "@/lib/finance/business-days";
import { parseBrNumber } from "@/lib/finance/br-number";
import { evaluateQuickEntry } from "@/lib/finance/quick-entry";

type Target = { year: number; month: number };

function formatDateBR(date: Date | string | null): string {
  if (!date) return "—";
  if (typeof date === "string") {
    const [, month, day] = date.split("-");
    return `${day}/${month}`;
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function previousMonth(target: Target): Target {
  return target.month === 1 ? { year: target.year - 1, month: 12 } : { year: target.year, month: target.month - 1 };
}

function signedCurrency(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatCurrency(Math.abs(value))}`;
}

export function QuickEntryPanel({ onSaved }: { onSaved: () => Promise<void> | void }) {
  // Mês da data-base (D−1): no 1º dia útil do mês, o lançamento ainda é do mês anterior.
  const defaultTarget = useMemo<Target>(() => {
    const dataDay = previousBusinessDay(new Date());
    return { year: dataDay.getFullYear(), month: dataDay.getMonth() + 1 };
  }, []);
  const targets = useMemo(() => [defaultTarget, previousMonth(defaultTarget)], [defaultTarget]);
  const [target, setTarget] = useState<Target>(defaultTarget);
  const [data, setData] = useState<ReturnsPacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/returns/pace?year=${target.year}&month=${target.month}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Erro ao carregar os valores do mês.");
      setData(payload as ReturnsPacePayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar os valores do mês.");
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setValues({});
    setFeedback(null);
  }, [target]);

  const today = useMemo(() => (data ? new Date(`${data.today}T12:00:00`) : new Date()), [data]);
  const isCurrent = data?.pace.isCurrentMonth ?? false;
  const rows = useMemo(() => {
    if (!data) return [];
    return data.pace.investments
      .slice()
      .sort((a, b) => (a.type === b.type ? a.label.localeCompare(b.label, "pt-BR") : a.type === "CDB" ? -1 : 1))
      .map((item) => {
        const raw = values[item.investmentId] ?? "";
        const parsed = raw.trim() ? parseBrNumber(raw) : null;
        const evaluation = evaluateQuickEntry({
          year: target.year,
          month: target.month,
          current: item.realized,
          asOfDate: isCurrent && item.realized > 0 ? item.asOfDate : null,
          dailyRate: isCurrent ? item.dailyRate : 0,
          newValue: parsed,
          today,
        });
        return { item, raw, parsed, invalid: raw.trim() !== "" && parsed === null, evaluation };
      });
  }, [data, values, target, isCurrent, today]);

  const pending = rows.filter((row) => row.parsed !== null && Math.abs(row.evaluation.delta ?? 0) > 0.004);
  const hasInvalid = rows.some((row) => row.invalid);
  const closed = data?.closed ?? false;
  const dataDate = rows[0]?.evaluation.dataDate ?? null;
  const totalCurrent = rows.reduce((acc, row) => acc + row.item.realized, 0);
  const totalNext = rows.reduce((acc, row) => acc + (row.parsed ?? row.item.realized), 0);

  const handleSave = async () => {
    if (pending.length === 0 || hasInvalid || closed) return;
    const withWarnings = pending.filter((row) => row.evaluation.warnings.length > 0);
    if (
      withWarnings.length > 0 &&
      !window.confirm(
        `Há ${withWarnings.length} lançamento(s) com alerta:\n\n${withWarnings
          .map((row) => `• ${row.item.label}: ${row.evaluation.warnings.join(" ")}`)
          .join("\n")}\n\nSalvar mesmo assim?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    const failures: string[] = [];
    const failedIds = new Set<string>();
    let saved = 0;
    // Um POST por investimento: a rota valida o mês fechado e grava a revisão de auditoria.
    for (const row of pending) {
      try {
        const res = await fetch("/api/returns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            investment_id: row.item.investmentId,
            year: target.year,
            month: target.month,
            income_value: row.parsed,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "erro ao salvar");
        }
        saved += 1;
      } catch (err) {
        failedIds.add(row.item.investmentId);
        failures.push(`${row.item.label}: ${err instanceof Error ? err.message : "erro ao salvar"}`);
      }
    }
    setSaving(false);
    setValues((prev) => {
      const next = { ...prev };
      for (const row of pending) {
        if (!failedIds.has(row.item.investmentId)) delete next[row.item.investmentId];
      }
      return next;
    });
    setFeedback(
      failures.length === 0
        ? { tone: "ok", text: `${saved} lançamento(s) salvo(s).` }
        : { tone: "error", text: `${saved} salvo(s); falharam: ${failures.join("; ")}` },
    );
    await onSaved();
    await load();
  };

  return (
    <section className="card space-y-3 border border-indigo-500/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Lançamento rápido</h2>
          <p className="text-xs text-slate-400">
            Informe o acumulado do mês. Data-base de hoje:{" "}
            <span className="font-semibold text-cyan-300">{formatDateBR(dataDate)}</span>
          </p>
        </div>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
          value={`${target.year}-${target.month}`}
          onChange={(e) => {
            const [year, month] = e.target.value.split("-").map(Number);
            setTarget({ year, month });
          }}
        >
          {targets.map((item) => (
            <option key={`${item.year}-${item.month}`} value={`${item.year}-${item.month}`}>
              {monthName(item.month)}/{item.year}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {closed ? (
        <p className="rounded-md bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
          {monthName(target.month)}/{target.year} está fechado para lançamentos.
        </p>
      ) : null}
      {loading && !data ? <p className="text-xs text-slate-400">Carregando...</p> : null}
      {data && rows.length === 0 ? <p className="text-xs text-slate-400">Nenhum investimento ativo neste mês.</p> : null}

      <div className="space-y-2">
        {rows.map(({ item, raw, invalid, evaluation }) => (
          <div key={item.investmentId} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {item.label}
                  {item.type === "FII" ? <span className="ml-1 text-[10px] text-emerald-300">FII</span> : null}
                </p>
                <p className="text-[11px] text-slate-500">
                  {item.realized > 0 && isCurrent
                    ? `dados até ${formatDateBR(item.asOfDate)}${
                        item.dailyRate > 0 ? ` · ritmo ${formatCurrency(item.dailyRate)}/d.u.` : ""
                      }`
                    : item.realized > 0
                      ? "lançado"
                      : "sem lançamento"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-200">{formatCurrency(item.realized)}</p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                inputMode="decimal"
                placeholder="Novo acumulado"
                value={raw}
                disabled={closed || saving}
                onChange={(e) => setValues((prev) => ({ ...prev, [item.investmentId]: e.target.value }))}
                className={`min-w-0 flex-1 rounded-lg border bg-slate-950 px-3 py-2 text-right text-base text-slate-100 outline-none ${
                  invalid ? "border-rose-500" : "border-slate-700 focus:border-indigo-400"
                }`}
              />
              <div className="w-28 shrink-0 text-right text-xs">
                {evaluation.delta === null ? (
                  <span className="text-slate-600">—</span>
                ) : (
                  <>
                    <span
                      className={`block font-semibold ${
                        evaluation.delta > 0 ? "text-emerald-300" : evaluation.delta < 0 ? "text-rose-300" : "text-slate-400"
                      }`}
                    >
                      {signedCurrency(evaluation.delta)}
                    </span>
                    {isCurrent && evaluation.impliedDaily !== null ? (
                      <span className="block text-[11px] text-slate-400">
                        {formatCurrency(evaluation.impliedDaily)}/d.u. ({evaluation.businessDays})
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {invalid ? <p className="mt-1 text-[11px] text-rose-300">Valor inválido (ex.: 1.234,56)</p> : null}
            {evaluation.warnings.map((warning) => (
              <p key={warning} className="mt-1 text-[11px] text-amber-300">
                ⚠ {warning}
              </p>
            ))}
          </div>
        ))}
      </div>

      {rows.length > 0 ? (
        <div className="flex items-center justify-between rounded-xl bg-slate-900/70 px-3 py-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-slate-400">Total do mês</span>
          <span className="text-right">
            <span className="block font-semibold text-slate-100">{formatCurrency(totalCurrent)}</span>
            {pending.length > 0 ? (
              <span className={`block text-[11px] ${totalNext - totalCurrent >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                → {formatCurrency(totalNext)} ({signedCurrency(totalNext - totalCurrent)})
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {feedback ? (
        <p className={`text-xs ${feedback.tone === "error" ? "text-rose-300" : "text-emerald-300"}`}>{feedback.text}</p>
      ) : null}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || closed || hasInvalid || pending.length === 0}
        className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {saving ? "Salvando..." : `Salvar lançamentos${pending.length > 0 ? ` (${pending.length})` : ""}`}
      </button>
    </section>
  );
}
