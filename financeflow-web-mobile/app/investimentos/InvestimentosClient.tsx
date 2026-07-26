"use client";

import { useEffect, useState } from "react";
import { Investment } from "@/types";
import { formatCurrency, formatPct } from "@/lib/format";

const KNOWN_INSTITUTIONS: Record<string, string[]> = {
  CDB: ["Itaú", "Santander", "Banco do Brasil", "XP", "Nubank", "Inter", "BTG Pactual"],
  FII: ["B3"],
};

export function InvestmentosClient({ envReady }: { envReady: boolean }) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  const [formType, setFormType] = useState<"CDB" | "FII">("CDB");
  const [formInstitution, setFormInstitution] = useState("");
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCdiRate, setFormCdiRate] = useState("");
  const [formBenchmark, setFormBenchmark] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formLiquidity, setFormLiquidity] = useState("");
  const [formMaturityDate, setFormMaturityDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadInvestments() {
    setLoading(true);
    const res = await fetch("/api/investments", { cache: "no-store" });
    const data = res.ok ? ((await res.json()) as Investment[]) : [];
    setInvestments(data);
    setLoading(false);
  }

  useEffect(() => {
    if (!envReady) { setLoading(false); return; }
    void loadInvestments();
  }, [envReady]);

  function resetForm() {
    setFormType("CDB");
    setFormInstitution("");
    setFormName("");
    setFormAmount("");
    setFormCdiRate("");
    setFormBenchmark("");
    setFormStartDate("");
    setFormLiquidity("");
    setFormMaturityDate("");
    setEditingId(null);
    setFormError(null);
  }

  function startEdit(inv: Investment) {
    setEditingId(inv.id);
    setFormType(inv.type);
    setFormInstitution(inv.institution);
    setFormName(inv.name);
    setFormAmount(String(inv.amount_invested));
    setFormCdiRate(inv.cdi_rate != null ? String(inv.cdi_rate) : "");
    setFormBenchmark(inv.benchmark ?? "");
    setFormStartDate(inv.start_date ?? "");
    setFormLiquidity(inv.liquidity ?? "");
    setFormMaturityDate(inv.maturity_date ?? "");
  }

  async function handleSave() {
    if (!formInstitution || !formName || !formAmount) {
      setFormError("Preencha tipo, instituição, nome e valor.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type: formType,
        institution: formInstitution.trim(),
        name: formName.trim(),
        amount_invested: Number(formAmount.replace(",", ".")),
      };
      if (formCdiRate) payload.cdi_rate = Number(formCdiRate);
      if (formBenchmark) payload.benchmark = formBenchmark.trim();
      if (formStartDate) payload.start_date = formStartDate;
      if (formLiquidity) payload.liquidity = formLiquidity.trim();
      if (formMaturityDate) payload.maturity_date = formMaturityDate;

      const endpoint = editingId ? `/api/investments/${editingId}` : "/api/investments";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Erro ao salvar");
      }
      resetForm();
      await loadInvestments();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(inv: Investment) {
    if (!confirm(`Excluir "${inv.name}" (${inv.institution})? Esta ação é irreversível.`)) return;
    await fetch(`/api/investments/${inv.id}`, { method: "DELETE" });
    await loadInvestments();
  }

  const total = investments.reduce((acc, i) => acc + Number(i.amount_invested ?? 0), 0);
  const cdb = investments.filter((i) => i.type === "CDB").reduce((acc, i) => acc + Number(i.amount_invested ?? 0), 0);
  const fii = investments.filter((i) => i.type === "FII").reduce((acc, i) => acc + Number(i.amount_invested ?? 0), 0);

  if (!envReady) {
    return (
      <div className="card">
        <h1 className="text-lg font-bold">Investimentos</h1>
        <p className="mt-2 text-sm text-slate-400">Configure as variáveis do Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Investimentos</h1>
        <p className="text-sm text-slate-400">Gerencie sua carteira.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="card">
          <p className="card-title">Total investido</p>
          <p className="card-value">{formatCurrency(total)}</p>
        </article>
        <article className="card">
          <p className="card-title">Exposição CDB</p>
          <p className="card-value text-amber-300">{formatCurrency(cdb)}</p>
          <p className="text-xs text-slate-500">{formatPct(total > 0 ? (cdb / total) * 100 : 0)}</p>
        </article>
        <article className="card">
          <p className="card-title">Exposição FIIs</p>
          <p className="card-value text-emerald-300">{formatCurrency(fii)}</p>
          <p className="text-xs text-slate-500">{formatPct(total > 0 ? (fii / total) * 100 : 0)}</p>
        </article>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">{editingId ? "Editar investimento" : "Novo investimento"}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Tipo</label>
            <select value={formType} onChange={(e) => { setFormType(e.target.value as "CDB" | "FII"); setFormInstitution(""); }} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              <option value="CDB">CDB</option>
              <option value="FII">FII</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Instituição</label>
            <input
              list={`inst-${formType}`}
              value={formInstitution}
              onChange={(e) => setFormInstitution(e.target.value)}
              placeholder="Digite ou selecione"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            />
            <datalist id={`inst-${formType}`}>
              {(KNOWN_INSTITUTIONS[formType] ?? []).map((i) => <option key={i} value={i} />)}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Nome</label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Valor investido (R$)</label>
            <input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </div>
          {formType === "CDB" && (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-400">% CDI (ex: 110)</label>
                <input value={formCdiRate} onChange={(e) => setFormCdiRate(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="Opcional" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Benchmark</label>
                <input value={formBenchmark} onChange={(e) => setFormBenchmark(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="Ex: 110% CDI" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Data início</label>
                <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Vencimento</label>
                <input type="date" value={formMaturityDate} onChange={(e) => setFormMaturityDate(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-400">Liquidez</label>
                <input value={formLiquidity} onChange={(e) => setFormLiquidity(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="Ex: diária, no vencimento, D+30" />
              </div>
            </>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => void handleSave()} disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:bg-slate-700">
            {saving ? "Salvando..." : editingId ? "Atualizar" : "Adicionar"}
          </button>
          {editingId && (
            <button onClick={resetForm} className="rounded-md border border-slate-700 px-4 py-2 text-sm">Cancelar</button>
          )}
        </div>
        {formError && <p className="mt-2 text-xs text-rose-300">{formError}</p>}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold">Carteira</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (
          <table className="min-w-full text-left text-xs md:text-sm">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">Instituição</th>
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">Valor</th>
                <th className="px-2 py-2">%</th>
                <th className="px-2 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((i) => {
                const amount = Number(i.amount_invested ?? 0);
                return (
                  <tr key={i.id} className="border-b border-slate-800/70 last:border-0">
                    <td className="px-2 py-2">{i.type}</td>
                    <td className="px-2 py-2">{i.institution}</td>
                    <td className="px-2 py-2">{i.name}</td>
                    <td className="px-2 py-2">{formatCurrency(amount)}</td>
                    <td className="px-2 py-2">{formatPct(total > 0 ? (amount / total) * 100 : 0)}</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => startEdit(i)} className="mr-2 rounded-md border border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-800">Editar</button>
                      <button onClick={() => void handleDelete(i)} className="rounded-md border border-rose-700 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30">Excluir</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
