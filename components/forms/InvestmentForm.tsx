"use client";

import { useEffect, useMemo, useState } from "react";
import { Investment, InvestmentType } from "../../types";

interface Props {
  onSaved?: (investment: Investment) => void;
  initial?: Investment | null;
  onCancelEdit?: () => void;
}

const KNOWN_INSTITUTIONS: Record<InvestmentType, string[]> = {
  CDB: ["Itaú", "Santander", "Banco do Brasil", "XP", "Nubank", "Inter", "BTG Pactual"],
  FII: ["B3"],
};

export function InvestmentForm({ onSaved, initial, onCancelEdit }: Props) {
  const [type, setType] = useState<InvestmentType>(initial?.type ?? "CDB");
  const [institution, setInstitution] = useState<string>(
    initial?.institution ?? "",
  );
  const [name, setName] = useState("");
  const [amountInvested, setAmountInvested] = useState("");
  const [cdiRate, setCdiRate] = useState("");
  const [benchmark, setBenchmark] = useState("");
  const [startDate, setStartDate] = useState("");
  const [liquidity, setLiquidity] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isEditing = Boolean(initial?.id);

  useEffect(() => {
    if (!initial) return;
    setType(initial.type);
    setInstitution(initial.institution);
    setName(initial.name);
    setAmountInvested(String(initial.amount_invested ?? ""));
    setCdiRate(initial.cdi_rate != null ? String(initial.cdi_rate) : "");
    setBenchmark(initial.benchmark ?? "");
    setStartDate(initial.start_date ?? "");
    setLiquidity(initial.liquidity ?? "");
    setMaturityDate(initial.maturity_date ?? "");
  }, [initial]);

  useEffect(() => {
    if (initial) return;
    setName("");
    setAmountInvested("");
    setCdiRate("");
    setBenchmark("");
    setStartDate("");
    setLiquidity("");
    setMaturityDate("");
    setType("CDB");
    setInstitution("");
  }, [initial]);

  const institutions = useMemo(() => KNOWN_INSTITUTIONS[type], [type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        type,
        institution: institution.trim(),
        name,
        amount_invested: Number(amountInvested),
      };
      if (cdiRate) payload.cdi_rate = Number(cdiRate);
      if (benchmark) payload.benchmark = benchmark.trim();
      if (startDate) payload.start_date = startDate;
      if (liquidity) payload.liquidity = liquidity.trim();
      if (maturityDate) payload.maturity_date = maturityDate;

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
        setCdiRate("");
        setBenchmark("");
        setStartDate("");
        setLiquidity("");
        setMaturityDate("");
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
            setInstitution("");
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
          placeholder="Digite ou selecione"
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

      {type === "CDB" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">% CDI (ex: 110 para 110% CDI)</label>
            <input
              type="number"
              step="0.01"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={cdiRate}
              onChange={(e) => setCdiRate(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Benchmark (ex: &quot;110% CDI&quot;, &quot;IPCA+6%&quot;)</label>
            <input
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Data início</label>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">Vencimento</label>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Liquidez</label>
            <input
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
              placeholder="Ex: diária, no vencimento, D+30"
            />
          </div>
        </>
      )}

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
