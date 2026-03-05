"use client";

import { useEffect, useMemo, useState } from "react";
import { Investment, MonthlyReturn } from "../../types";
import { formatCurrencyBRL, monthNameFull } from "../../lib/formatters";
import { ReturnForm } from "../forms/ReturnForm";

type ReturnRow = {
  year: number;
  month: number;
  label: string;
  income: number;
  investmentId: string;
  isFii: boolean;
};

interface ReturnsPageClientProps {}

export function ReturnsPageClient(_props: ReturnsPageClientProps) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [rawReturns, setRawReturns] = useState<MonthlyReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const [invRes, retRes] = await Promise.all([
          fetch("/api/investments"),
          fetch("/api/returns"),
        ]);
        if (!invRes.ok || !retRes.ok) {
          throw new Error("Erro ao carregar dados de retornos.");
        }
        const invData: Investment[] = await invRes.json();
        const retData: MonthlyReturn[] = await retRes.json();
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

  const fiiInvestments = investments.filter((i) => i.type === "FII");
  const consolidatedFiiId = fiiInvestments[0]?.id;

  const rows: ReturnRow[] = useMemo(() => {
    const map = new Map<string, ReturnRow>();

    for (const ret of rawReturns) {
      const inv = investments.find((i) => i.id === ret.investment_id);
      if (!inv) continue;

      const isFii = inv.type === "FII";
      const key = isFii
        ? `FII-${ret.year}-${ret.month}`
        : `INV-${inv.id}-${ret.year}-${ret.month}`;

      const label = isFii
        ? "Dividendos FIIs"
        : inv.institution === "Itaú"
          ? "CDB Itaú"
          : inv.institution === "Santander"
            ? "CDB Santander"
            : `${inv.name}`;

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
          investmentId: isFii && consolidatedFiiId ? consolidatedFiiId : inv.id,
          isFii,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        a.year - b.year || a.month - b.month || a.label.localeCompare(b.label),
    );
  }, [rawReturns, investments, consolidatedFiiId]);

  const years = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((r) => set.add(r.year));
    return Array.from(set).sort();
  }, [rows]);

  const uiInvestments: Investment[] = useMemo(() => {
    const cdbs = investments.filter((i) => i.type === "CDB");
    const fiiBase = fiiInvestments[0];
    return [
      ...cdbs.map((inv) => ({
        ...inv,
        name:
          inv.institution === "Itaú"
            ? "CDB Itaú"
            : inv.institution === "Santander"
              ? "CDB Santander"
              : inv.name,
      })),
      ...(fiiBase
        ? [{ ...fiiBase, name: "Dividendos FIIs", institution: "FIIs" }]
        : []),
    ];
  }, [investments, fiiInvestments]);

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

      if (row.isFii || row.label === "Dividendos FIIs") {
        entry.fiis += row.income;
      } else if (row.label === "CDB Itaú") {
        entry.itau += row.income;
      } else if (row.label === "CDB Santander") {
        entry.santander += row.income;
      }

      entry.total = entry.itau + entry.santander + entry.fiis;
    }

    return Array.from(map.values()).sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );
  }, [rows, yearFilter]);

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
    setEditing(row);
  };

  const investmentFilterOptions = [
    { value: "all", label: "Todos os investimentos" },
    ...uiInvestments.map((inv) => ({
      value: inv.type === "FII" ? "fii" : inv.id,
      label:
        inv.type === "FII"
          ? "Dividendos FIIs"
          : inv.institution === "Itaú"
            ? "CDB Itaú"
            : inv.institution === "Santander"
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
                          className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                        >
                          Editar
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
                <th className="px-2 py-2 text-rose-400">Santander</th>
                <th className="px-2 py-2 text-emerald-400">FIIs</th>
                <th className="px-2 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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

