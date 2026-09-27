"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReturnsPacePayload } from "../../types";
import { formatCurrencyBRL, monthNameFull } from "../../lib/formatters";
import { previousBusinessDay } from "../../lib/business-days";
import { parseBrNumber } from "../../lib/import-parsers";
import { evaluateQuickEntry } from "../../lib/quick-entry";

interface Props {
  /** Muda quando outro bloco da página grava retornos, para recarregar os valores atuais. */
  reloadToken: number;
  onSaved: () => Promise<void> | void;
}

type Target = { year: number; month: number };

function formatDateBR(date: Date | string | null): string {
  if (!date) return "—";
  if (typeof date === "string") {
    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year}`;
  }
  return date.toLocaleDateString("pt-BR");
}

function previousMonth(target: Target): Target {
  return target.month === 1 ? { year: target.year - 1, month: 12 } : { year: target.year, month: target.month - 1 };
}

export function QuickEntryPanel({ reloadToken, onSaved }: Props) {
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
  }, [load, reloadToken]);

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

  const pending = rows.filter((row) => row.parsed !== null && Math.abs((row.evaluation.delta ?? 0)) > 0.004);
  const hasInvalid = rows.some((row) => row.invalid);
  const closed = data?.closed ?? false;
  const dataDate = rows[0]?.evaluation.dataDate ?? null;

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
        failures.push(`${row.item.label}: ${err instanceof Error ? err.message : "erro ao salvar"}`);
      }
    }
    setSaving(false);
    setValues((prev) => {
      const next = { ...prev };
      for (const row of pending) {
        if (!failures.some((failure) => failure.startsWith(`${row.item.label}:`))) delete next[row.item.investmentId];
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

  const totals = rows.reduce(
    (acc, row) => {
      acc.current += row.item.realized;
      acc.next += row.parsed ?? row.item.realized;
      return acc;
    },
    { current: 0, next: 0 },
  );

  return (
    <section className="rounded-xl border border-indigo-500/40 bg-surface/80 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Lançamento rápido</h3>
          <p className="text-xs text-slate-400">
            Informe o <strong>acumulado do mês</strong> de cada investimento. Data-base do lançamento de hoje:{" "}
            <span className="font-semibold text-cyan-300">{formatDateBR(dataDate)}</span> (dia útil anterior).
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
              {monthNameFull(item.month)}/{item.year}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      {closed ? (
        <p className="mb-2 rounded-md bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
          {monthNameFull(target.month)}/{target.year} está fechado. Reabra o mês no resumo abaixo para lançar.
        </p>
      ) : null}
      {loading && !data ? <p className="text-xs text-slate-400">Carregando...</p> : null}

      {data && rows.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum investimento ativo neste mês.</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs md:text-sm">
            <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2">Investimento</th>
                <th className="px-2 py-2 text-right">Atual</th>
                <th className="px-2 py-2">Último lançamento</th>
                <th className="px-2 py-2">Novo acumulado</th>
                <th className="px-2 py-2 text-right">Diferença</th>
                {isCurrent ? <th className="px-2 py-2 text-right">Por dia útil</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {rows.map(({ item, raw, invalid, evaluation }) => (
                <tr key={item.investmentId} className="align-top">
                  <td className="px-2 py-2 font-medium text-slate-100">
                    {item.label}
                    {item.type === "FII" ? <span className="ml-1 text-[10px] text-emerald-300">FII</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-200">
                    {formatCurrencyBRL(item.realized)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-400">
                    {item.realized > 0 && isCurrent ? (
                      <>
                        dados até {formatDateBR(item.asOfDate)}
                        {item.dailyRate > 0 ? (
                          <span className="block text-[11px] text-slate-500">
                            ritmo {formatCurrencyBRL(item.dailyRate)}/dia útil
                          </span>
                        ) : null}
                      </>
                    ) : item.realized > 0 ? (
                      "lançado"
                    ) : (
                      "sem lançamento"
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      inputMode="decimal"
                      placeholder={item.realized > 0 ? formatCurrencyBRL(item.realized).replace("R$", "").trim() : "0,00"}
                      value={raw}
                      disabled={closed || saving}
                      onChange={(e) => setValues((prev) => ({ ...prev, [item.investmentId]: e.target.value }))}
                      className={`w-32 rounded-md border bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 outline-none focus:ring-1 ${
                        invalid ? "border-rose-500 focus:ring-rose-500" : "border-slate-700 focus:border-accent focus:ring-accent"
                      }`}
                    />
                    {invalid ? <p className="mt-1 text-[11px] text-rose-400">Valor inválido (ex.: 1.234,56)</p> : null}
                    {evaluation.warnings.map((warning) => (
                      <p key={warning} className="mt-1 max-w-[260px] text-[11px] text-amber-300">
                        ⚠ {warning}
                      </p>
                    ))}
                  </td>
                  <td
                    className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
                      evaluation.delta === null
                        ? "text-slate-600"
                        : evaluation.delta > 0
                          ? "text-emerald-300"
                          : evaluation.delta < 0
                            ? "text-rose-300"
                            : "text-slate-400"
                    }`}
                  >
                    {evaluation.delta === null
                      ? "—"
                      : `${evaluation.delta > 0 ? "+" : ""}${formatCurrencyBRL(evaluation.delta)}`}
                  </td>
                  {isCurrent ? (
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-300">
                      {evaluation.impliedDaily === null ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <>
                          {formatCurrencyBRL(evaluation.impliedDaily)}
                          <span className="block text-[11px] text-slate-500">{evaluation.businessDays} d.u.</span>
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700 font-semibold">
                <td className="px-2 py-2 text-slate-300">Total do mês</td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-100">
                  {formatCurrencyBRL(totals.current)}
                </td>
                <td className="px-2 py-2" />
                <td className="whitespace-nowrap px-2 py-2 text-cyan-300">
                  {pending.length > 0 ? `→ ${formatCurrencyBRL(totals.next)}` : ""}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
                    totals.next - totals.current >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {pending.length > 0
                    ? `${totals.next - totals.current >= 0 ? "+" : ""}${formatCurrencyBRL(totals.next - totals.current)}`
                    : ""}
                </td>
                {isCurrent ? <td className="px-2 py-2" /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${feedback?.tone === "error" ? "text-rose-400" : "text-emerald-300"}`}>{feedback?.text ?? ""}</p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || closed || hasInvalid || pending.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Salvando..." : `Salvar lançamentos${pending.length > 0 ? ` (${pending.length})` : ""}`}
        </button>
      </div>
    </section>
  );
}
