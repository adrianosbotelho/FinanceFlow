"use client";

import { useEffect, useState } from "react";
import { Investment } from "@/types";
import { formatCurrency, formatPct, monthName } from "@/lib/format";

interface Position {
  investment_id: string;
  year: number;
  month: number;
  market_value: number;
  taxes_paid: number;
  fees_paid: number;
}

export function PerformanceClient({ initialYear, envReady }: { initialYear: number; envReady: boolean }) {
  const [year] = useState(initialYear);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [, setLoading] = useState(true);

  const [formInvestmentId, setFormInvestmentId] = useState("");
  const [formMonth, setFormMonth] = useState(new Date().getMonth() + 1);
  const [formMarketValue, setFormMarketValue] = useState("");
  const [formTaxes, setFormTaxes] = useState("");
  const [formFees, setFormFees] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [invRes, posRes] = await Promise.all([
      fetch("/api/investments", { cache: "no-store" }),
      fetch(`/api/positions?year=${year}`, { cache: "no-store" }),
    ]);
    const inv = invRes.ok ? ((await invRes.json()) as Investment[]) : [];
    const pos = posRes.ok ? ((await posRes.json()) as Position[]) : [];
    setInvestments(inv);
    setPositions(pos);
    if (!formInvestmentId && inv.length > 0) setFormInvestmentId(inv[0].id);
    setLoading(false);
  }

  useEffect(() => {
    if (!envReady) { setLoading(false); return; }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, envReady]);

  const totalInvested = investments.reduce((acc, i) => acc + Number(i.amount_invested ?? 0), 0);
  const latestMonth = positions.length > 0 ? Math.max(...positions.map((p) => p.month)) : null;
  const latestPositions = latestMonth !== null ? positions.filter((p) => p.month === latestMonth) : [];
  const currentMarketValue = latestPositions.reduce((acc, p) => acc + Number(p.market_value), 0);
  const capitalGain = currentMarketValue > 0 ? currentMarketValue - totalInvested : 0;
  const capitalGainPct = totalInvested > 0 && currentMarketValue > 0 ? (capitalGain / totalInvested) * 100 : null;
  const totalTaxes = positions.reduce((acc, p) => acc + Number(p.taxes_paid ?? 0), 0);
  const totalFees = positions.reduce((acc, p) => acc + Number(p.fees_paid ?? 0), 0);

  async function handleSave() {
    if (!formInvestmentId || !formMarketValue) return;
    setSaving(true);
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investment_id: formInvestmentId,
          year,
          month: formMonth,
          market_value: Number(formMarketValue.replace(",", ".")),
          taxes_paid: Number((formTaxes || "0").replace(",", ".")),
          fees_paid: Number((formFees || "0").replace(",", ".")),
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar posição");
      setFormMarketValue("");
      setFormTaxes("");
      setFormFees("");
      await loadAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (!envReady) {
    return (
      <div className="card">
        <h1 className="text-lg font-bold">Performance</h1>
        <p className="mt-2 text-sm text-slate-400">Configure as variáveis do Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Performance</h1>
        <p className="text-sm text-slate-400">Retorno do patrimônio e posições mensais ({year})</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="card">
          <p className="card-title">Capital investido</p>
          <p className="card-value">{formatCurrency(totalInvested)}</p>
        </article>
        <article className="card">
          <p className="card-title">Valor de mercado</p>
          <p className="card-value">{currentMarketValue > 0 ? formatCurrency(currentMarketValue) : "—"}</p>
          {latestMonth && <p className="text-xs text-slate-500">ref. {monthName(latestMonth)}/{year}</p>}
        </article>
        <article className="card">
          <p className="card-title">Ganho de capital</p>
          <p className={`card-value ${capitalGainPct !== null && capitalGainPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {capitalGainPct !== null ? formatPct(capitalGainPct) : "—"}
          </p>
          <p className="text-xs text-slate-500">{formatCurrency(capitalGain)}</p>
        </article>
        <article className="card">
          <p className="card-title">Impostos + Taxas</p>
          <p className="card-value text-rose-300">{formatCurrency(totalTaxes + totalFees)}</p>
        </article>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Registrar posição mensal</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Investimento</label>
            <select value={formInvestmentId} onChange={(e) => setFormInvestmentId(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              {investments.map((inv) => (
                <option key={inv.id} value={inv.id}>{inv.type} • {inv.institution}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Mês</label>
            <select value={formMonth} onChange={(e) => setFormMonth(Number(e.target.value))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{monthName(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Valor mercado (R$)</label>
            <input value={formMarketValue} onChange={(e) => setFormMarketValue(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Impostos (R$)</label>
            <input value={formTaxes} onChange={(e) => setFormTaxes(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Taxas (R$)</label>
            <input value={formFees} onChange={(e) => setFormFees(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="0,00" />
          </div>
        </div>
        <button onClick={() => void handleSave()} disabled={saving} className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:bg-slate-700">
          {saving ? "Salvando..." : "Salvar posição"}
        </button>
      </section>

      {positions.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold">Posições registradas ({year})</h2>
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-2 py-2">Mês</th>
                <th className="px-2 py-2">Investimento</th>
                <th className="px-2 py-2">Valor mercado</th>
                <th className="px-2 py-2">Impostos</th>
                <th className="px-2 py-2">Taxas</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const inv = investments.find((i) => i.id === p.investment_id);
                return (
                  <tr key={`${p.investment_id}-${p.month}`} className="border-b border-slate-800/70 last:border-0">
                    <td className="px-2 py-2 text-slate-200">{monthName(p.month)}</td>
                    <td className="px-2 py-2 text-slate-300">{inv ? `${inv.name} (${inv.institution})` : p.investment_id}</td>
                    <td className="px-2 py-2 text-slate-100">{formatCurrency(p.market_value)}</td>
                    <td className="px-2 py-2 text-rose-300">{formatCurrency(p.taxes_paid)}</td>
                    <td className="px-2 py-2 text-rose-300">{formatCurrency(p.fees_paid)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
