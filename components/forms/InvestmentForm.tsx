"use client";

import { useEffect, useMemo, useState } from "react";
import { Investment, InvestmentType } from "../../types";

interface Props {
  onSaved?: (investment: Investment) => void;
  initial?: Investment | null;
  onCancelEdit?: () => void;
}

const institutionsByType: Record<InvestmentType, string[]> = {
  CDB: ["Itaú", "Santander"],
  FII: ["B3"],
};

export function InvestmentForm({ onSaved, initial, onCancelEdit }: Props) {
  const [type, setType] = useState<InvestmentType>(initial?.type ?? "CDB");
  const [institution, setInstitution] = useState<string>(
    initial?.institution ?? "Itaú",
  );
  const [name, setName] = useState("");
  const [amountInvested, setAmountInvested] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isEditing = Boolean(initial?.id);

  useEffect(() => {
    if (!initial) return;
    setType(initial.type);
    setInstitution(initial.institution);
    setName(initial.name);
    setAmountInvested(String(initial.amount_invested ?? ""));
  }, [initial]);

  useEffect(() => {
    if (initial) return;
    setName("");
    setAmountInvested("");
    setType("CDB");
    setInstitution("Itaú");
  }, [initial]);

  const institutions = useMemo(() => institutionsByType[type], [type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        type,
        institution: institution.trim(),
        name,
        amount_invested: Number(amountInvested),
      };
      const endpoint = isEditing ? `/api/investments/${initial!.id}` : "/api/investments";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = "Erro ao salvar investimento";
        try {
          const err = await res.json();
          if (err?.error) message = err.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const data: Investment = await res.json();
      onSaved?.(data);
      if (!isEditing) {
        setName("");
        setAmountInvested("");
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Não foi possível salvar o investimento.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
    >
      <h3 className="text-sm font-semibold text-slate-200">
        {isEditing ? "Editar investimento" : "Novo investimento"}
      </h3>
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
        <input
          list={`institutions-${type}`}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          required
        />
        <datalist id={`institutions-${type}`}>
          {institutions.map((inst) => (
            <option key={inst} value={inst}>
              {inst}
            </option>
          ))}
        </datalist>
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
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-xs font-medium text-white shadow-sm hover:bg-accent-soft disabled:opacity-60"
        >
          {submitting
            ? "Salvando..."
            : isEditing
              ? "Atualizar investimento"
              : "Adicionar investimento"}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-4 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancelar edição
          </button>
        )}
      </div>
    </form>
  );
}
