"use client";

import { useState } from "react";
import { Investment, InvestmentType } from "../../types";

interface Props {
  onCreated?: (investment: Investment) => void;
}

const institutionsByType: Record<InvestmentType, string[]> = {
  CDB: ["Itaú", "Santander"],
  FII: ["XPML11", "MXRF11", "HGLG11"],
};

export function InvestmentForm({ onCreated }: Props) {
  const [type, setType] = useState<InvestmentType>("CDB");
  const [institution, setInstitution] = useState<string>("Itaú");
  const [name, setName] = useState("");
  const [amountInvested, setAmountInvested] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        type,
        institution,
        name,
        amount_invested: Number(amountInvested),
      };
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erro ao salvar investimento");
      const data: Investment = await res.json();
      onCreated?.(data);
      setName("");
      setAmountInvested("");
    } catch (err) {
      console.error(err);
      alert("Não foi possível salvar o investimento.");
    } finally {
      setSubmitting(false);
    }
  };

  const institutions = institutionsByType[type];

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-300">Tipo</label>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={type}
          onChange={(e) => {
            const value = e.target.value as InvestmentType;
            setType(value);
            setInstitution(institutionsByType[value][0]);
          }}
        >
          <option value="CDB">CDB</option>
          <option value="FII">FII</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-300">Instituição</label>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        >
          {institutions.map((inst) => (
            <option key={inst} value={inst}>
              {inst}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-300">Nome</label>
        <input
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-300">Valor Investido (R$)</label>
        <input
          type="number"
          step="0.01"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={amountInvested}
          onChange={(e) => setAmountInvested(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white shadow-sm hover:bg-accent-soft disabled:opacity-60"
      >
        {submitting ? "Salvando..." : "Adicionar investimento"}
      </button>
    </form>
  );
}
