"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CashEventType,
  Investment,
  InvestmentCashEvent,
  MonthlyClosure,
  MonthlyReturn,
  MonthlyReturnRevision,
} from "../../types";
import { formatCurrencyBRL, monthNameFull } from "../../lib/formatters";
import { publishDataSyncUpdate } from "../../lib/client-data-sync";
import { ReturnForm } from "../forms/ReturnForm";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ReturnRow = {
  year: number;
  month: number;
  label: string;
  income: number;
  investmentId: string;
  isFii: boolean;
  isAggregated: boolean;
  sourceCount: number;
};

type ReturnSortField = "year" | "month" | "label" | "income";
type ReturnSortDirection = "asc" | "desc";

const EVENT_TYPE_OPTIONS: Array<{ value: CashEventType; label: string }> = [
  { value: "APORTE", label: "Aporte" },
  { value: "RESGATE", label: "Resgate" },
  { value: "IMPOSTO", label: "Imposto" },
  { value: "TAXA", label: "Taxa" },
];

const EVENT_TYPE_COLORS: Record<CashEventType, string> = {
  APORTE: "text-emerald-300",
  RESGATE: "text-amber-300",
  IMPOSTO: "text-rose-300",
  TAXA: "text-rose-300",
};

function parseBrDate(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("pt-BR");
}

function parseBrDateTime(raw: string | undefined): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString("pt-BR");
}

function countBusinessDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekDay = new Date(year, month - 1, day).getDay();
    if (weekDay >= 1 && weekDay <= 5) count += 1;
  }
  return count;
}

function countBusinessDaysElapsedInMonth(year: number, month: number, maxDay: number): number {
  let count = 0;
  for (let day = 1; day <= maxDay; day += 1) {
    const weekDay = new Date(year, month - 1, day).getDay();
    if (weekDay >= 1 && weekDay <= 5) count += 1;
  }
  return count;
}

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
  const [sortField, setSortField] = useState<ReturnSortField>("year");
  const [sortDirection, setSortDirection] = useState<ReturnSortDirection>("desc");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [editing, setEditing] = useState<ReturnRow | null>(null);
  const [eventYear, setEventYear] = useState(() => new Date().getFullYear());
  const [cashEvents, setCashEvents] = useState<InvestmentCashEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventInvestmentId, setEventInvestmentId] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventType, setEventType] = useState<CashEventType>("APORTE");
  const [eventAmount, setEventAmount] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [revisionYear, setRevisionYear] = useState(() => new Date().getFullYear());
  const [revisionInvestmentFilter, setRevisionInvestmentFilter] = useState<string>("all");
  const [returnRevisions, setReturnRevisions] = useState<MonthlyReturnRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);

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
        if (invData.length > 0) {
          const defaultInvestmentId = invData[0].id;
          setEventInvestmentId((prev) => prev || defaultInvestmentId);
        }
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Erro inesperado.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadCashEvents = useCallback(async (year: number) => {
    try {
      setEventsLoading(true);
      const res = await fetch(`/api/investment-cash-events?year=${year}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setCashEvents([]);
        return;
      }
      const data: InvestmentCashEvent[] = await res.json();
      setCashEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setCashEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const loadReturnRevisions = useCallback(
    async (year: number, investmentId: string) => {
      try {
        setRevisionsLoading(true);
        const params = new URLSearchParams({ year: String(year) });
        if (investmentId !== "all") {
          params.set("investment_id", investmentId);
        }
        const res = await fetch(`/api/return-revisions?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setReturnRevisions([]);
          return;
        }
        const data: MonthlyReturnRevision[] = await res.json();
        setReturnRevisions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setReturnRevisions([]);
      } finally {
        setRevisionsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadCashEvents(eventYear);
  }, [eventYear, loadCashEvents]);

  useEffect(() => {
    void loadReturnRevisions(revisionYear, revisionInvestmentFilter);
  }, [loadReturnRevisions, revisionYear, revisionInvestmentFilter]);

  const rows: ReturnRow[] = useMemo(() => {
    type MutableRow = ReturnRow & { sourceIds: Set<string> };
    const map = new Map<string, MutableRow>();
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
        existing.sourceIds.add(inv.id);
        existing.sourceCount = existing.sourceIds.size;
        existing.isAggregated = existing.sourceCount > 1;
        existing.investmentId = Array.from(existing.sourceIds)[0];
      } else {
        map.set(key, {
          year: ret.year,
          month: ret.month,
          label,
          income: incomeValue,
          investmentId: inv.id,
          isFii,
          isAggregated: false,
          sourceCount: 1,
          sourceIds: new Set([inv.id]),
        });
      }
    }

    return Array.from(map.values())
      .map(({ sourceIds: _sourceIds, ...row }) => row)
      .sort(
      (a, b) =>
        a.year - b.year || a.month - b.month || a.label.localeCompare(b.label),
    );
  }, [rawReturns, investments]);

  const years = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((r) => set.add(r.year));
    return Array.from(set).sort();
  }, [rows]);

  const eventYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<number>([currentYear, ...years]);
    cashEvents.forEach((event) => {
      if (Number.isFinite(event.year)) {
        set.add(Number(event.year));
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [cashEvents, years]);

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

  const investmentById = useMemo(() => {
    const map = new Map<string, Investment>();
    for (const inv of uiInvestments) {
      map.set(inv.id, inv);
    }
    return map;
  }, [uiInvestments]);

  const revisionYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<number>([currentYear, ...years]);
    return Array.from(set).sort((a, b) => a - b);
  }, [years]);

  const revisionRows = useMemo(() => {
    return returnRevisions.map((revision) => {
      const inv = investmentById.get(revision.investment_id);
      const label = inv
        ? inv.type === "CDB" && inv.institution === "Itaú"
          ? "CDB Itaú"
          : inv.type === "CDB"
            ? "CDB Santander"
            : inv.name
        : revision.investment_id;
      return {
        ...revision,
        investmentLabel: label,
        investmentInstitution: inv?.institution ?? "-",
      };
    });
  }, [investmentById, returnRevisions]);

  const hasOnlySyntheticRevisions = useMemo(() => {
    return revisionRows.length > 0 && revisionRows.every((row) => row.is_synthetic);
  }, [revisionRows]);

  const selectedRevisionMonth = useMemo(() => {
    if (revisionRows.length === 0) return null;
    const latest = revisionRows[0];
    return {
      year: Number(latest.year),
      month: Number(latest.month),
    };
  }, [revisionRows]);

  const revisionChartData = useMemo(() => {
    if (!selectedRevisionMonth) return [];
    return [...revisionRows]
      .filter(
        (row) =>
          Number(row.year) === selectedRevisionMonth.year &&
          Number(row.month) === selectedRevisionMonth.month,
      )
      .sort((a, b) => {
        const aTime = new Date(a.created_at ?? "").getTime();
        const bTime = new Date(b.created_at ?? "").getTime();
        return aTime - bTime;
      })
      .map((row, idx) => ({
        seq: idx + 1,
        timestamp: parseBrDateTime(row.created_at),
        investmentLabel: row.investmentLabel,
        delta: Number(row.delta_income_value ?? 0),
        newValue: Number(row.new_income_value ?? 0),
      }));
  }, [revisionRows, selectedRevisionMonth]);

  const monthlyForecast = useMemo(() => {
    if (!selectedRevisionMonth) return null;
    if (hasOnlySyntheticRevisions) return null;
    const { year, month } = selectedRevisionMonth;
    const now = new Date();
    const isCurrentContext =
      year === now.getFullYear() && month === now.getMonth() + 1;
    const monthRows = revisionRows
      .filter((row) => Number(row.year) === year && Number(row.month) === month)
      .sort((a, b) => {
        const aTime = new Date(a.created_at ?? "").getTime();
        const bTime = new Date(b.created_at ?? "").getTime();
        return aTime - bTime;
      });
    if (monthRows.length === 0) return null;

    const oldest = monthRows[0];
    const latest = monthRows[monthRows.length - 1];
    const latestValue = Number(latest.new_income_value ?? 0);
    const startValue = Number(
      oldest.previous_income_value ?? (oldest.new_income_value - oldest.delta_income_value),
    );
    const growthSoFar = latestValue - startValue;
    const daysElapsed = isCurrentContext
      ? countBusinessDaysElapsedInMonth(year, month, now.getDate())
      : countBusinessDaysInMonth(year, month);
    const totalDays = countBusinessDaysInMonth(year, month);
    const daysRemaining = isCurrentContext ? Math.max(totalDays - daysElapsed, 0) : 0;
    const dailyPace = daysElapsed > 0 ? growthSoFar / daysElapsed : 0;
    const projectedClose = latestValue + dailyPace * daysRemaining;

    const confidence =
      !isCurrentContext
        ? "Fechado"
        : monthRows.length >= 6
          ? "Alta"
          : monthRows.length >= 3
            ? "Média"
            : "Baixa";

    return {
      year,
      month,
      latestValue,
      startValue,
      growthSoFar,
      dailyPace,
      projectedClose,
      updatesCount: monthRows.length,
      daysElapsed,
      daysRemaining,
      confidence,
    };
  }, [hasOnlySyntheticRevisions, revisionRows, selectedRevisionMonth]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (yearFilter !== "all" && row.year !== yearFilter) return false;
      if (investmentFilter === "all") return true;
      if (investmentFilter === "fii") return row.isFii;
      return row.investmentId === investmentFilter;
    });
  }, [rows, yearFilter, investmentFilter]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const sorted = [...filteredRows].sort((a, b) => {
      if (sortField === "year") {
        return (
          (a.year - b.year) * direction ||
          (a.month - b.month) * direction ||
          a.label.localeCompare(b.label, "pt-BR")
        );
      }
      if (sortField === "month") {
        return (
          (a.month - b.month) * direction ||
          (a.year - b.year) * direction ||
          a.label.localeCompare(b.label, "pt-BR")
        );
      }
      if (sortField === "label") {
        return (
          a.label.localeCompare(b.label, "pt-BR") * direction ||
          (a.year - b.year) * direction ||
          (a.month - b.month) * direction
        );
      }
      return (
        (a.income - b.income) * direction ||
        (a.year - b.year) * direction ||
        (a.month - b.month) * direction ||
        a.label.localeCompare(b.label, "pt-BR")
      );
    });
    return sorted;
  }, [filteredRows, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = sortedRows.slice(startIndex, startIndex + pageSize);

  const toggleSort = (field: ReturnSortField) => {
    setPage(1);
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  };

  const sortIndicator = (field: ReturnSortField) => {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

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
      await loadReturnRevisions(revisionYear, revisionInvestmentFilter);
      publishDataSyncUpdate("returns");
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCashEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/investment-cash-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investment_id: eventInvestmentId,
          event_date: eventDate,
          type: eventType,
          amount: Number(eventAmount),
          notes: eventNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao salvar evento de caixa.");
      }
      setEventAmount("");
      setEventNotes("");
      await loadCashEvents(eventYear);
      publishDataSyncUpdate("returns");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar evento.");
    }
  };

  const handleDeleteCashEvent = async (event: InvestmentCashEvent) => {
    if (!confirm("Excluir este evento de caixa?")) return;
    try {
      const res = await fetch("/api/investment-cash-events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao excluir evento.");
      }
      await loadCashEvents(eventYear);
      publishDataSyncUpdate("returns");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir evento.");
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
          Centralize aqui os lançamentos: rendimentos mensais e eventos de caixa
          (aporte, resgate, imposto e taxa).
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
                  <th className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("year")}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-slate-100"
                    >
                      Ano
                      <span className="text-[10px] text-slate-500">
                        {sortIndicator("year")}
                      </span>
                    </button>
                  </th>
                  <th className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("month")}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-slate-100"
                    >
                      Mês
                      <span className="text-[10px] text-slate-500">
                        {sortIndicator("month")}
                      </span>
                    </button>
                  </th>
                  <th className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("label")}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-slate-100"
                    >
                      Investimento
                      <span className="text-[10px] text-slate-500">
                        {sortIndicator("label")}
                      </span>
                    </button>
                  </th>
                  <th className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("income")}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-slate-100"
                    >
                      Renda
                      <span className="text-[10px] text-slate-500">
                        {sortIndicator("income")}
                      </span>
                    </button>
                  </th>
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
                              ? "Consolidado"
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
              {startIndex + pageRows.length} de {sortedRows.length} registros
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

      <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Revisões de retorno (auditoria + previsão)
            </h3>
            <p className="text-xs text-slate-400">
              Cada alteração de retorno grava o delta (atualizado - anterior) para melhorar o acompanhamento intra-mês.
            </p>
            {hasOnlySyntheticRevisions && (
              <p className="mt-1 text-xs text-amber-300">
                Exibindo snapshot inicial dos retornos do período. As revisões detalhadas aparecem após editar/atualizar os lançamentos.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={revisionYear}
              onChange={(e) => setRevisionYear(Number(e.target.value))}
            >
              {revisionYearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={revisionInvestmentFilter}
              onChange={(e) => setRevisionInvestmentFilter(e.target.value)}
            >
              <option value="all">Todos os investimentos</option>
              {uiInvestments.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name} ({inv.institution})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <h4 className="text-xs font-semibold text-slate-200">
              Evolução por revisão
              {selectedRevisionMonth
                ? ` (${monthNameFull(selectedRevisionMonth.month)}/${selectedRevisionMonth.year})`
                : ""}
            </h4>
            {revisionsLoading ? (
              <p className="mt-3 text-xs text-slate-400">Carregando revisões...</p>
            ) : revisionChartData.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">Sem revisões para os filtros selecionados.</p>
            ) : (
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={revisionChartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="seq" stroke="#94a3b8" tickFormatter={(value) => `#${value}`} />
                    <YAxis
                      yAxisId="delta"
                      stroke="#94a3b8"
                      width={72}
                      tickFormatter={formatCurrencyBRL}
                    />
                    <YAxis
                      yAxisId="updated"
                      orientation="right"
                      stroke="#94a3b8"
                      width={72}
                      tickFormatter={formatCurrencyBRL}
                    />
                    <Tooltip
                      formatter={(value: number | string, key) => {
                        const numeric = Number(value ?? 0);
                        if (key === "delta") return [formatCurrencyBRL(numeric), "Δ atualização"];
                        return [formatCurrencyBRL(numeric), "Valor atualizado"];
                      }}
                      labelFormatter={(value) => {
                        const point = revisionChartData[Number(value) - 1];
                        if (!point) return `Revisão #${value}`;
                        return `Revisão #${value} • ${point.timestamp} • ${point.investmentLabel}`;
                      }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "#1f2937",
                      }}
                      labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                    />
                    <Legend />
                    <ReferenceLine yAxisId="delta" y={0} stroke="#64748b" />
                    <Bar yAxisId="delta" dataKey="delta" name="Δ atualização">
                      {revisionChartData.map((point) => (
                        <Cell
                          key={`delta-${point.seq}`}
                          fill={point.delta >= 0 ? "#22c55e" : "#f43f5e"}
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="updated"
                      type="monotone"
                      dataKey="newValue"
                      name="Valor atualizado"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <h4 className="text-xs font-semibold text-slate-200">Previsão de fechamento do mês</h4>
            {!monthlyForecast ? (
              <p className="mt-3 text-xs text-slate-400">Sem dados suficientes para projeção.</p>
            ) : (
              <div className="mt-3 grid gap-2 text-xs">
                <p className="text-slate-300">
                  Base:{" "}
                  <span className="font-semibold text-cyan-300">
                    {monthNameFull(monthlyForecast.month)}/{monthlyForecast.year}
                  </span>
                </p>
                <p className="text-slate-300">
                  Valor atual:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatCurrencyBRL(monthlyForecast.latestValue)}
                  </span>
                </p>
                <p className="text-slate-300">
                  Crescimento no mês (revisões):{" "}
                  <span
                    className={`font-semibold ${
                      monthlyForecast.growthSoFar >= 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {formatCurrencyBRL(monthlyForecast.growthSoFar)}
                  </span>
                </p>
                <p className="text-slate-300">
                  Ritmo por dia útil:{" "}
                  <span
                    className={`font-semibold ${
                      monthlyForecast.dailyPace >= 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {formatCurrencyBRL(monthlyForecast.dailyPace)}
                  </span>
                </p>
                <p className="text-slate-300">
                  Dias úteis restantes:{" "}
                  <span className="font-semibold text-slate-100">
                    {monthlyForecast.daysRemaining}
                  </span>
                </p>
                <p className="text-slate-300">
                  Fechamento projetado:{" "}
                  <span className="font-semibold text-cyan-300">
                    {formatCurrencyBRL(monthlyForecast.projectedClose)}
                  </span>
                </p>
                <p className="text-slate-300">
                  Confiança:{" "}
                  <span
                    className={`font-semibold ${
                      monthlyForecast.confidence === "Alta"
                        ? "text-emerald-300"
                        : monthlyForecast.confidence === "Média"
                          ? "text-cyan-300"
                          : monthlyForecast.confidence === "Fechado"
                            ? "text-slate-200"
                            : "text-amber-300"
                    }`}
                  >
                    {monthlyForecast.confidence}
                  </span>{" "}
                  <span className="text-slate-500">({monthlyForecast.updatesCount} revisão(ões))</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs md:text-sm">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="px-2 py-2">Data/Hora</th>
                <th className="px-2 py-2">Ano</th>
                <th className="px-2 py-2">Mês</th>
                <th className="px-2 py-2">Investimento</th>
                <th className="px-2 py-2">Anterior</th>
                <th className="px-2 py-2">Atualizado</th>
                <th className="px-2 py-2">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {revisionsLoading ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                    Carregando revisões...
                  </td>
                </tr>
              ) : revisionRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                    Nenhuma revisão encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                revisionRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-2 py-2 text-slate-300">{parseBrDateTime(row.created_at)}</td>
                    <td className="px-2 py-2 text-slate-300">{row.year}</td>
                    <td className="px-2 py-2 text-slate-300">{monthNameFull(Number(row.month))}</td>
                    <td className="px-2 py-2 text-slate-300">
                      {row.investmentLabel}
                      <span className="ml-1 text-[11px] text-slate-500">({row.investmentInstitution})</span>
                    </td>
                    <td className="px-2 py-2 text-slate-300">
                      {row.previous_income_value === null || row.previous_income_value === undefined
                        ? "—"
                        : formatCurrencyBRL(Number(row.previous_income_value))}
                    </td>
                    <td className="px-2 py-2 font-medium text-cyan-300">
                      {formatCurrencyBRL(Number(row.new_income_value ?? 0))}
                    </td>
                    <td
                      className={`px-2 py-2 font-semibold ${
                        Number(row.delta_income_value ?? 0) > 0
                          ? "text-emerald-300"
                          : Number(row.delta_income_value ?? 0) < 0
                            ? "text-rose-300"
                            : "text-slate-300"
                      }`}
                    >
                      {Number(row.delta_income_value ?? 0) > 0 ? "+" : ""}
                      {formatCurrencyBRL(Number(row.delta_income_value ?? 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <form
          onSubmit={handleSaveCashEvent}
          className="space-y-3 rounded-xl border border-slate-800 bg-surface/80 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">Registrar evento de caixa</h3>
            <select
              value={eventYear}
              onChange={(e) => setEventYear(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {eventYearOptions.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400">
            Use este bloco para aporte, resgate, imposto e taxa. O rendimento continua no formulário de Retorno Mensal.
          </p>

          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            value={eventInvestmentId}
            onChange={(e) => setEventInvestmentId(e.target.value)}
            required
          >
            {uiInvestments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.name} ({inv.institution})
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              required
            />
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as CashEventType)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              required
            >
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor (R$)"
            value={eventAmount}
            onChange={(e) => setEventAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
            required
          />

          <input
            type="text"
            placeholder="Observação (opcional)"
            value={eventNotes}
            onChange={(e) => setEventNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
          />

          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-cyan-700 bg-cyan-950/50 px-4 text-xs font-medium text-cyan-100"
          >
            Salvar evento
          </button>
        </form>

        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">
            Eventos de caixa ({eventYear})
          </h3>
          {eventsLoading ? (
            <p className="text-xs text-slate-400">Carregando eventos...</p>
          ) : cashEvents.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum evento lançado para {eventYear}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="px-2 py-1">Data</th>
                    <th className="px-2 py-1">Investimento</th>
                    <th className="px-2 py-1">Tipo</th>
                    <th className="px-2 py-1">Valor</th>
                    <th className="px-2 py-1">Observação</th>
                    <th className="px-2 py-1 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cashEvents.map((event) => {
                    const inv = investmentById.get(event.investment_id);
                    return (
                      <tr
                        key={event.id}
                        className="border-t border-slate-800 text-slate-200"
                      >
                        <td className="px-2 py-2">{parseBrDate(event.event_date)}</td>
                        <td className="px-2 py-2">
                          {inv ? `${inv.name} (${inv.institution})` : event.investment_id}
                        </td>
                        <td className={`px-2 py-2 font-medium ${EVENT_TYPE_COLORS[event.type]}`}>
                          {EVENT_TYPE_OPTIONS.find((option) => option.value === event.type)?.label ?? event.type}
                        </td>
                        <td className="px-2 py-2">{formatCurrencyBRL(Number(event.amount))}</td>
                        <td className="px-2 py-2 text-slate-400">{event.notes || "-"}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDeleteCashEvent(event)}
                            className="rounded-md border border-rose-700 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/30"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
