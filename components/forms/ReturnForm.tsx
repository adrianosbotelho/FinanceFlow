"use client";

import { useState } from "react";
import { Investment, MonthlyReturn } from "../../types";

interface Props {
  investments: Investment[];
  onCreated?: (ret: MonthlyReturn) => void;
}

export function ReturnForm({ investments, onCreated }: Props) {
  const [investmentId, setInvestmentId] = useState<string>(
    investments[0]?.id ?? "",
  );
  const [month, setMonth] = useState<number>(1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [incomeValue, setIncomeValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        investment_id: investmentId,
        month,
        year,
        income_value: Number(incomeValue),
      };
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erro ao registrar retorno");
      const data: MonthlyReturn = await res.json();
      onCreated?.(data);
      setIncomeValue("");
    } catch (err) {
      console.error(err);
      alert("Não foi possível registrar o retorno.");
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
          <input
            type="number"
            min={1}
            max={12}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            required
          />
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
        <label className="text-xs text-slate-300">Renda (R$)</label>
        <input
          type="number"
          step="0.01"
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
        {submitting ? "Salvando..." : "Registrar retorno"}
      </button>
    </form>
  );
}
