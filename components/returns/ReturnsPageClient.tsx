"use client";

import { useEffect, useMemo, useState } from "react";
import { Investment, MonthlyClosure, MonthlyReturn } from "../../types";
import { formatCurrencyBRL, monthNameFull } from "../../lib/formatters";
import { ReturnForm } from "../forms/ReturnForm";

type ReturnRow = {
  year: number;
  month: number;
  label: string;
  income: number;
  investmentId: string;
  isFii: boolean;
  isAggregated: boolean;
};

interface ReturnsPageClientProps {}

export function ReturnsPageClient(_props: ReturnsPageClientProps) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [rawReturns, setRawReturns] = useState<MonthlyReturn[]>([]);
  const [closures, setClosures] = useState<MonthlyClosure[]>([]);
  const [closuresAvailable, setClosuresAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closureUpdatingKey, setClosureUpdatingKey] = useState<string | null>(
    null,
  );

  const [yearFilter, setYearFilter] = useState<number | "all">(
    () => new Date().getFullYear(),
  );
  const [investmentFilter, setInvestmentFilter] = useState<string>("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [editing, setEditing] = useState<ReturnRow | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [invRes, retRes, closureRes] = await Promise.all([
          fetch("/api/investments"),
          fetch("/api/returns"),
          fetch("/api/monthly-closures"),
        ]);
        if (!invRes.ok || !retRes.ok) {
          throw new Error("Erro ao carregar dados de retornos.");
        }
        const invData: Investment[] = await invRes.json();
        const retData: MonthlyReturn[] = await retRes.json();
        if (closureRes.ok) {
          const closureData: MonthlyClosure[] = await closureRes.json();
          setClosures(Array.isArray(closureData) ? closureData : []);
          setClosuresAvailable(true);
        } else {
          setClosures([]);
          setClosuresAvailable(false);
        }
        setInvestments(invData);
        setRawReturns(retData);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Erro inesperado.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const rows: ReturnRow[] = useMemo(() => {
    const map = new Map<string, ReturnRow>();
    const byId = new Map<string, Investment>();
    for (const inv of investments) {
      byId.set(inv.id, inv);
    }

    for (const ret of rawReturns) {
      const inv = byId.get(ret.investment_id);
      if (!inv) continue;

      const isFii = inv.type === "FII";
      const isItau = inv.type === "CDB" && inv.institution === "Itaú";
      const key = isFii
        ? `FII-${ret.year}-${ret.month}`
        : isItau
          ? `CDB-ITAU-${ret.year}-${ret.month}`
          : `CDB-SANTANDER-${ret.year}-${ret.month}`;

      const label = isFii
        ? "Dividendos FIIs"
        : isItau
          ? "CDB Itaú"
          : "CDB Santander";

      const incomeValue = Number(ret.income_value ?? 0);

      const existing = map.get(key);
      if (existing) {
        existing.income += incomeValue;
      } else {
        map.set(key, {
          year: ret.year,
          month: ret.month,
          label,
          income: incomeValue,
          investmentId: isFii ? "__FII_GROUP__" : inv.id,
          isFii,
          isAggregated: isFii,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        a.year - b.year || a.month - b.month || a.label.localeCompare(b.label),
    );
  }, [rawReturns, investments]);

  const years = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((r) => set.add(r.year));
    return Array.from(set).sort();
  }, [rows]);

  const uiInvestments: Investment[] = useMemo(() => {
    return investments.map((inv) => ({
      ...inv,
      name:
        inv.type === "CDB" && inv.institution === "Itaú"
          ? "CDB Itaú"
          : inv.type === "CDB"
            ? "CDB Santander"
            : inv.name,
    }));
  }, [investments]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (yearFilter !== "all" && row.year !== yearFilter) return false;
      if (investmentFilter === "all") return true;
      if (investmentFilter === "fii") return row.isFii;
      return row.investmentId === investmentFilter;
    });
  }, [rows, yearFilter, investmentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + pageSize);

  // Resumo mensal consolidado (formato Itau / Santander / FIIs / Total)
  const monthlySummary = useMemo(() => {
    type MonthSummary = {
      year: number;
      month: number;
      itau: number;
      santander: number;
      fiis: number;
      total: number;
    };

    const map = new Map<string, MonthSummary>();

    const source = rows.filter((row) =>
      yearFilter === "all" ? true : row.year === yearFilter,
    );

    for (const row of source) {
      const key = `${row.year}-${row.month}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          year: row.year,
          month: row.month,
          itau: 0,
          santander: 0,
          fiis: 0,
          total: 0,
        };
        map.set(key, entry);
      }

      if (row.isFii) {
        entry.fiis += row.income;
      } else if (row.label === "CDB Itaú") {
        entry.itau += row.income;
      } else {
        entry.santander += row.income;
      }

      entry.total = entry.itau + entry.santander + entry.fiis;
    }

    return Array.from(map.values()).sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );
  }, [rows, yearFilter]);

  const closedPeriods = useMemo(() => {
    const set = new Set<string>();
    closures.forEach((c) => {
      if (c.is_closed) {
        set.add(`${c.year}-${c.month}`);
      }
    });
    return set;
  }, [closures]);

  const isPeriodClosed = (year: number, month: number) =>
    closedPeriods.has(`${year}-${month}`);

  const handleSaved = async () => {
    setEditing(null);
    try {
      const res = await fetch("/api/returns");
      if (!res.ok) return;
      const data: MonthlyReturn[] = await res.json();
      setRawReturns(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEdit = (row: ReturnRow) => {
    if (isPeriodClosed(row.year, row.month)) {
      alert(
        `O período ${row.month}/${row.year} está fechado. Reabra para editar.`,
      );
      return;
    }
    setEditing(row);
  };

  const refreshClosures = async () => {
    try {
      const res = await fetch("/api/monthly-closures");
      if (!res.ok) {
        setClosuresAvailable(false);
        return;
      }
      const data: MonthlyClosure[] = await res.json();
      setClosures(Array.isArray(data) ? data : []);
      setClosuresAvailable(true);
    } catch (e) {
      console.error(e);
      setClosuresAvailable(false);
    }
  };

  const toggleMonthClosure = async (
    year: number,
    month: number,
    shouldClose: boolean,
  ) => {
    const key = `${year}-${month}`;
    setClosureUpdatingKey(key);
    try {
      if (!closuresAvailable) {
        throw new Error(
          "Fechamento mensal indisponível. Aplique o schema.sql no Supabase para habilitar.",
        );
      }
      const res = await fetch("/api/monthly-closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          is_closed: shouldClose,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Falha ao atualizar fechamento mensal.");
      }
      await refreshClosures();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Erro ao atualizar fechamento.");
    } finally {
      setClosureUpdatingKey(null);
    }
  };

  const investmentFilterOptions = [
    { value: "all", label: "Todos os investimentos" },
    { value: "fii", label: "Todos os FIIs" },
    ...uiInvestments.map((inv) => ({
      value: inv.id,
      label:
        inv.institution === "Itaú"
          ? "CDB Itaú"
          : inv.type === "CDB"
            ? "CDB Santander"
            : inv.name,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">
          Retornos Mensais
        </h2>
        <p className="text-sm text-slate-400">
          Registre ou atualize o valor acumulado de rendimentos por mês. Se o
          mês já existir para o investimento, o valor será sobrescrito.
        </p>
      </div>

      {error && (
        <p className="text-sm text-rose-400">
          {error} (verifique a conexão com o Supabase)
        </p>
      )}
      {!closuresAvailable && (
        <p className="text-sm text-amber-300">
          Fechamento mensal indisponível neste banco. Aplique o
          `supabase/schema.sql` para habilitar.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200">
                Histórico de retornos
              </h3>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  yearFilter === "all"
                    ? "bg-slate-700/80 text-slate-300"
                    : "bg-accent/25 text-accent border border-accent/50"
                }`}
              >
                {yearFilter === "all" ? "Todos os anos" : `Ano ${yearFilter}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <select
                className={`rounded-lg px-2 py-1 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-accent ${
                  yearFilter === "all"
                    ? "border border-slate-700 bg-slate-900 focus:border-accent"
                    : "border border-accent/60 bg-accent/10 focus:border-accent"
                }`}
                value={yearFilter === "all" ? "all" : String(yearFilter)}
                onChange={(e) =>
                  setYearFilter(
                    e.target.value === "all"
                      ? "all"
                      : Number(e.target.value),
                  )
                }
              >
                <option value="all">Todos os anos</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={investmentFilter}
                onChange={(e) => setInvestmentFilter(e.target.value)}
              >
                {investmentFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Ano</th>
                  <th className="px-2 py-2">Mês</th>
                  <th className="px-2 py-2">Investimento</th>
                  <th className="px-2 py-2">Renda</th>
                  <th className="px-2 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-4 text-center text-slate-400"
                    >
                      Carregando retornos...
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-4 text-center text-slate-400"
                    >
                      Nenhum retorno encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr
                      key={`${row.year}-${row.month}-${row.label}`}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-2 py-2 text-slate-300">{row.year}</td>
                      <td className="px-2 py-2 text-slate-300">
                        {monthNameFull(row.month)}
                      </td>
                      <td className="px-2 py-2 text-slate-300">{row.label}</td>
                      <td
                        className={`px-2 py-2 font-medium ${
                          row.isFii
                            ? "text-emerald-400"
                            : row.label === "CDB Itaú"
                              ? "text-amber-400"
                              : row.label === "CDB Santander"
                                ? "text-rose-400"
                                : "text-slate-100"
                        }`}
                      >
                        {formatCurrencyBRL(row.income)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleEdit(row)}
                          disabled={
                            isPeriodClosed(row.year, row.month) ||
                            row.isAggregated
                          }
                          className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                        >
                          {isPeriodClosed(row.year, row.month)
                            ? "Fechado"
                            : row.isAggregated
                              ? "Agrupado"
                            : "Editar"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Mostrando {pageRows.length === 0 ? 0 : startIndex + 1}-
              {startIndex + pageRows.length} de {filteredRows.length} registros
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <span>
                Página {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                className="rounded-md border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>

        <ReturnForm
          investments={uiInvestments}
          onCreated={handleSaved}
          isPeriodClosed={isPeriodClosed}
          initial={
            editing
              ? {
                  investment_id: editing.investmentId,
                  month: editing.month,
                  year: editing.year,
                  income_value: editing.income,
                }
              : undefined
          }
        />
      </div>

      {/* Resumo mensal no formato Itau / Santander / FIIs / Total */}
      <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Resumo mensal consolidado
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs md:text-sm">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="px-2 py-2">Meses</th>
                <th className="px-2 py-2 text-amber-400">Itaú</th>
                <th className="px-2 py-2 text-rose-400">CDB Santander</th>
                <th className="px-2 py-2 text-emerald-400">FIIs</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 text-right">Fechamento</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-2 py-4 text-center text-slate-400"
                  >
                    Nenhum dado para o ano selecionado.
                  </td>
                </tr>
              ) : (
                monthlySummary.map((row) => (
                  <tr
                    key={`${row.year}-${row.month}`}
                    className="border-b border-slate-800/60 last:border-0"
                  >
                    {(() => {
                      const key = `${row.year}-${row.month}`;
                      const closed = isPeriodClosed(row.year, row.month);
                      const isUpdating = closureUpdatingKey === key;
                      return (
                        <>
                    <td className="px-2 py-2 text-slate-300">
                      {monthNameFull(row.month)}
                    </td>
                    <td className="px-2 py-2 font-medium text-amber-400">
                      {formatCurrencyBRL(row.itau)}
                    </td>
                    <td className="px-2 py-2 font-medium text-rose-400">
                      {formatCurrencyBRL(row.santander)}
                    </td>
                    <td className="px-2 py-2 font-medium text-emerald-400">
                      {formatCurrencyBRL(row.fiis)}
                    </td>
                    <td className="px-2 py-2 font-bold text-slate-100">
                      {formatCurrencyBRL(row.total)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          closed
                            ? "bg-rose-900/50 text-rose-300"
                            : "bg-emerald-900/40 text-emerald-300"
                        }`}
                      >
                        {closed ? "Fechado" : "Aberto"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={isUpdating || !closuresAvailable}
                        onClick={() =>
                          toggleMonthClosure(row.year, row.month, !closed)
                        }
                        className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {!closuresAvailable
                          ? "Indisponível"
                          : isUpdating
                          ? "Salvando..."
                          : closed
                            ? "Reabrir"
                            : "Fechar"}
                      </button>
                    </td>
                        </>
                      );
                    })()}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
