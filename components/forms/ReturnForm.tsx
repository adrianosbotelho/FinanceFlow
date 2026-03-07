"use client";

import { useEffect, useState } from "react";
import { Investment, MonthlyReturn } from "../../types";
import { monthNameFull } from "../../lib/formatters";

interface Props {
  investments: Investment[];
  onCreated?: (ret: MonthlyReturn) => void;
  initial?: {
    investment_id: string;
    month: number;
    year: number;
    income_value: number;
  };
}

export function ReturnForm({ investments, onCreated, initial }: Props) {
  const [investmentId, setInvestmentId] = useState<string>(
    initial?.investment_id ?? investments[0]?.id ?? "",
  );
  const [month, setMonth] = useState<number>(initial?.month ?? 1);
  const [year, setYear] = useState<number>(
    initial?.year ?? new Date().getFullYear(),
  );
  const [incomeValue, setIncomeValue] = useState(
    initial ? String(initial.income_value) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setInvestmentId(initial.investment_id);
    setMonth(initial.month);
    setYear(initial.year);
    setIncomeValue(String(initial.income_value));
  }, [initial]);

  useEffect(() => {
    if (investments.length === 0) return;
    const hasValidSelection = investmentId && investments.some((i) => i.id === investmentId);
    if (!hasValidSelection) {
      setInvestmentId(investments[0].id);
    }
  }, [investments, investmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!investmentId?.trim()) {
        throw new Error("Selecione um investimento.");
      }
      // Aceita vírgula ou ponto como decimal; ponto como milhar é removido (ex: 1.504,07 ou 86,95)
      const normalized = String(incomeValue).replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Valor de renda inválido. Use apenas números; você pode usar vírgula ou ponto como decimal (ex: 86,95 ou 86.95).");
      }

      const payload = {
        investment_id: investmentId.trim(),
        month,
        year,
        income_value: parsed,
      };
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = "Erro ao registrar retorno.";
        try {
          const err = await res.json();
          if (err?.error) message = err.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const data: MonthlyReturn = await res.json();
      onCreated?.(data);
      setIncomeValue("");
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível registrar o retorno.";
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-300">Investimento</label>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={investmentId}
          onChange={(e) => setInvestmentId(e.target.value)}
          required
        >
          {investments.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.name} ({inv.institution})
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-300">Mês</label>
          <select
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            required
          >
            {Array.from({ length: 12 }, (_, idx) => {
              const value = idx + 1;
              return (
                <option key={value} value={value}>
                  {monthNameFull(value)}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-300">Ano</label>
          <input
            type="number"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-300">
          Renda acumulada no mês (R$)
        </label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Ex: 86,95 ou 1504,07"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={incomeValue}
          onChange={(e) => setIncomeValue(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white shadow-sm hover:bg-accent-soft disabled:opacity-60"
      >
        {submitting ? "Salvando..." : initial ? "Atualizar retorno" : "Registrar retorno"}
      </button>
    </form>
  );
}
