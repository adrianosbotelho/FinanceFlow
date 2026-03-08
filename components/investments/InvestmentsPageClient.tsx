"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Investment } from "../../types";
import { formatCurrencyBRL } from "../../lib/formatters";
import { InvestmentForm } from "../forms/InvestmentForm";

export function InvestmentsPageClient() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadInvestments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/investments", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Não foi possível carregar investimentos.");
      }
      const data: Investment[] = await res.json();
      setInvestments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erro ao carregar investimentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvestments();
  }, [loadInvestments]);

  const totalInvested = useMemo(
    () => investments.reduce((acc, inv) => acc + Number(inv.amount_invested ?? 0), 0),
    [investments],
  );
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Investment[]>();
    for (const inv of investments) {
      const key = `${inv.type}::${inv.institution.toLowerCase()}::${inv.name.toLowerCase()}`;
      const group = map.get(key) ?? [];
      group.push(inv);
      map.set(key, group);
    }
    return Array.from(map.values()).filter((g) => g.length > 1);
  }, [investments]);

  const handleSaved = async () => {
    setEditing(null);
    await loadInvestments();
  };

  const handleDelete = async (inv: Investment) => {
    const confirmed = window.confirm(
      `Excluir "${inv.name}"? Isso também removerá os retornos mensais vinculados a este investimento.`,
    );
    if (!confirmed) return;
    setDeletingId(inv.id);
    try {
      const res = await fetch(`/api/investments/${inv.id}`, { method: "DELETE" });
      if (!res.ok) {
        let message = "Falha ao excluir investimento.";
        try {
          const err = await res.json();
          if (err?.error) message = err.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      if (editing?.id === inv.id) {
        setEditing(null);
      }
      await loadInvestments();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Erro ao excluir investimento.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Investimentos</h2>
        <p className="text-sm text-slate-400">
          Gerencie os lançamentos da carteira (incluir, editar e excluir) com
          vínculo direto aos retornos mensais.
        </p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {duplicateGroups.length > 0 && (
        <p className="text-sm text-amber-300">
          Foram encontrados investimentos duplicados com mesmo tipo/instituição/nome.
          Isso pode causar leitura confusa nos retornos mensais.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Carteira atual</h3>
            <span className="text-xs text-slate-400">
              Total investido: {formatCurrencyBRL(totalInvested)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Instituição</th>
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">Valor Investido</th>
                  <th className="px-2 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                      Carregando investimentos...
                    </td>
                  </tr>
                ) : investments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                      Nenhum investimento cadastrado.
                    </td>
                  </tr>
                ) : (
                  investments.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-2 py-2 text-slate-300">{inv.type}</td>
                      <td className="px-2 py-2 text-slate-300">{inv.institution}</td>
                      <td className="px-2 py-2 text-slate-300">{inv.name}</td>
                      <td className="px-2 py-2 font-medium text-slate-100">
                        {formatCurrencyBRL(inv.amount_invested)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setEditing(inv)}
                          className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(inv)}
                          disabled={deletingId === inv.id}
                          className="ml-2 rounded-md border border-rose-800/70 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30 disabled:opacity-50"
                        >
                          {deletingId === inv.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <InvestmentForm
          initial={editing}
          onSaved={handleSaved}
          onCancelEdit={() => setEditing(null)}
        />
      </div>
    </div>
  );
}
