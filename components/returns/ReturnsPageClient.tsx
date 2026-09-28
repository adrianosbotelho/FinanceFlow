"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CashEventType,
  Investment,
  InvestmentCashEvent,
  MonthlyClosure,
  MonthlyReturn,
  MonthlyReturnRevision,
  ReturnsPacePayload,
} from "../../types";
import { formatCurrencyBRL, monthNameFull } from "../../lib/formatters";
import { publishDataSyncUpdate } from "../../lib/client-data-sync";
import { ReturnForm } from "../forms/ReturnForm";
import { QuickEntryPanel } from "./QuickEntryPanel";
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
import { previousBusinessDay } from "../../lib/business-days";

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

// Cores por investimento (posição na lista de CDBs), para não repetir cor entre produtos do mesmo banco.
const INVESTMENT_TEXT_COLORS = ["text-amber-400", "text-rose-400", "text-violet-400", "text-sky-400", "text-orange-400", "text-cyan-400"];
const INVESTMENT_HEX = ["#f59e0b", "#f43f5e", "#a78bfa", "#38bdf8", "#fb923c", "#22d3ee"];
const FII_HEX = "#34d399";

function investmentTextColor(index: number): string {
  return INVESTMENT_TEXT_COLORS[index % INVESTMENT_TEXT_COLORS.length];
}

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

  const [revisionPage, setRevisionPage] = useState(1);
  const revisionPageSize = 10;
  const [eventPage, setEventPage] = useState(1);
  const eventPageSize = 10;

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
  const [quickEntryReload, setQuickEntryReload] = useState(0);
  const [closingPast, setClosingPast] = useState(false);
  const [forecastPace, setForecastPace] = useState<ReturnsPacePayload | null>(null);

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
      const key = isFii
        ? `FII-${ret.year}-${ret.month}`
        : `CDB-${inv.id}-${ret.year}-${ret.month}`;

      const label = isFii
        ? "Dividendos FIIs"
        : inv.name || `CDB ${inv.institution}`;

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
    return investments;
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
      const label = inv ? inv.name || `${inv.type} ${inv.institution}` : revision.investment_id;
      return {
        ...revision,
        investmentLabel: label,
        investmentInstitution: inv?.institution ?? "-",
      };
    });
  }, [investmentById, returnRevisions]);

  const availableRevisionMonths = useMemo(() => {
    const set = new Map<string, { year: number; month: number }>();
    for (const row of revisionRows) {
      const key = `${row.year}-${row.month}`;
      if (!set.has(key)) {
        set.set(key, { year: Number(row.year), month: Number(row.month) });
      }
    }
    return Array.from(set.values()).sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );
  }, [revisionRows]);

  const defaultRevisionMonth = useMemo(() => {
    if (availableRevisionMonths.length === 0) return null;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const current = availableRevisionMonths.find(
      (m) => m.year === currentYear && m.month === currentMonth,
    );
    if (current) return current;
    return availableRevisionMonths[availableRevisionMonths.length - 1];
  }, [availableRevisionMonths]);

  const [revisionMonthKey, setRevisionMonthKey] = useState<string | null>(null);

  useEffect(() => {
    if (defaultRevisionMonth) {
      setRevisionMonthKey(`${defaultRevisionMonth.year}-${defaultRevisionMonth.month}`);
    }
  }, [defaultRevisionMonth]);

  const selectedRevisionMonth = useMemo(() => {
    if (!revisionMonthKey) return defaultRevisionMonth;
    const found = availableRevisionMonths.find(
      (m) => `${m.year}-${m.month}` === revisionMonthKey,
    );
    return found ?? defaultRevisionMonth;
  }, [revisionMonthKey, availableRevisionMonths, defaultRevisionMonth]);

  const filteredRevisionRows = useMemo(() => {
    if (!selectedRevisionMonth) return revisionRows;
    return revisionRows.filter(
      (row) =>
        Number(row.year) === selectedRevisionMonth.year &&
        Number(row.month) === selectedRevisionMonth.month,
    );
  }, [revisionRows, selectedRevisionMonth]);

  useEffect(() => {
    setRevisionPage(1);
  }, [selectedRevisionMonth]);

  const revisionChartData = useMemo(() => {
    if (!selectedRevisionMonth) return [];
    return [...filteredRevisionRows]
      .sort((a, b) => {
        const aTime = new Date(a.created_at ?? "").getTime();
        const bTime = new Date(b.created_at ?? "").getTime();
        return aTime - bTime;
      })
      .map((row, idx) => ({
        seq: idx + 1,
        timestamp: parseBrDateTime(row.created_at),
        day: row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "",
        investmentId: row.investment_id,
        investmentLabel: row.investmentLabel,
        investmentInstitution: row.investmentInstitution,
        delta: Number(row.delta_income_value ?? 0),
        newValue: Number(row.new_income_value ?? 0),
      }));
  }, [filteredRevisionRows, selectedRevisionMonth]);

  // Previsão de fechamento: mesmo cálculo do Dashboard (lib/month-pace), via /api/returns/pace.
  useEffect(() => {
    if (!selectedRevisionMonth) {
      setForecastPace(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/returns/pace?year=${selectedRevisionMonth.year}&month=${selectedRevisionMonth.month}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: ReturnsPacePayload | null) => {
        if (!cancelled) setForecastPace(payload);
      })
      .catch(() => {
        if (!cancelled) setForecastPace(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRevisionMonth, quickEntryReload]);

  const monthlyForecast = useMemo(() => {
    if (!forecastPace || !selectedRevisionMonth) return null;
    const { pace } = forecastPace;
    if (pace.year !== selectedRevisionMonth.year || pace.month !== selectedRevisionMonth.month) return null;
    const items =
      revisionInvestmentFilter === "all"
        ? pace.investments
        : pace.investments.filter((item) => item.investmentId === revisionInvestmentFilter);
    if (items.length === 0) return null;
    const realized = items.reduce((acc, item) => acc + item.realized, 0);
    const projected = items.reduce((acc, item) => acc + item.projected, 0);
    const dailyRate = items.reduce((acc, item) => acc + item.dailyRate, 0);
    const previousTotal = revisionInvestmentFilter === "all" ? pace.previousMonthTotal : null;
    return {
      year: pace.year,
      month: pace.month,
      isCurrent: pace.isCurrentMonth,
      asOfDate: pace.asOfDate,
      realized,
      projected,
      dailyRate,
      elapsed: pace.elapsedBusinessDays,
      remaining: pace.remainingBusinessDays,
      total: pace.totalBusinessDays,
      previousTotal,
      projectedVsPrevious:
        previousTotal !== null && previousTotal > 0 ? ((projected - previousTotal) / previousTotal) * 100 : null,
      items,
    };
  }, [forecastPace, revisionInvestmentFilter, selectedRevisionMonth]);

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

  const cashEventsSummary = useMemo(() => {
    type SummaryRow = {
      month: number;
      investmentId: string;
      investmentLabel: string;
      aportes: number;
      resgates: number;
      impostos: number;
      taxas: number;
      fluxo: number;
    };
    const map = new Map<string, SummaryRow>();
    for (const ev of cashEvents) {
      const inv = investments.find((i) => i.id === ev.investment_id);
      const label = inv ? `${inv.name} (${inv.institution})` : ev.investment_id;
      const key = `${ev.month}-${ev.investment_id}`;
      let row = map.get(key);
      if (!row) {
        row = { month: Number(ev.month), investmentId: ev.investment_id, investmentLabel: label, aportes: 0, resgates: 0, impostos: 0, taxas: 0, fluxo: 0 };
        map.set(key, row);
      }
      const amount = Number(ev.amount ?? 0);
      if (ev.type === "APORTE") row.aportes += amount;
      else if (ev.type === "RESGATE") row.resgates += amount;
      else if (ev.type === "IMPOSTO") row.impostos += amount;
      else if (ev.type === "TAXA") row.taxas += amount;
      row.fluxo = row.aportes - row.resgates - row.impostos - row.taxas;
    }
    return Array.from(map.values()).sort((a, b) => a.month - b.month || a.investmentLabel.localeCompare(b.investmentLabel, "pt-BR"));
  }, [cashEvents, investments]);

  const cashEventsInvestmentTotals = useMemo(() => {
    const map = new Map<string, { investmentLabel: string; aportes: number; resgates: number; impostos: number; taxas: number; fluxo: number }>();
    for (const row of cashEventsSummary) {
      let entry = map.get(row.investmentId);
      if (!entry) {
        entry = { investmentLabel: row.investmentLabel, aportes: 0, resgates: 0, impostos: 0, taxas: 0, fluxo: 0 };
        map.set(row.investmentId, entry);
      }
      entry.aportes += row.aportes;
      entry.resgates += row.resgates;
      entry.impostos += row.impostos;
      entry.taxas += row.taxas;
      entry.fluxo += row.fluxo;
    }
    return Array.from(map.values()).sort((a, b) => a.investmentLabel.localeCompare(b.investmentLabel, "pt-BR"));
  }, [cashEventsSummary]);

  // Resumo mensal consolidado (dinâmico por investimento CDB + FIIs agrupados)
  const cdbInvestments = useMemo(
    () => investments.filter((inv) => inv.type === "CDB"),
    [investments],
  );

  const monthlySummary = useMemo(() => {
    type MonthSummary = {
      year: number;
      month: number;
      cdbValues: Map<string, number>;
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
          cdbValues: new Map(),
          fiis: 0,
          total: 0,
        };
        map.set(key, entry);
      }

      if (row.isFii) {
        entry.fiis += row.income;
      } else {
        const currentVal = entry.cdbValues.get(row.investmentId) ?? 0;
        entry.cdbValues.set(row.investmentId, currentVal + row.income);
      }

      entry.total = Array.from(entry.cdbValues.values()).reduce((a, b) => a + b, 0) + entry.fiis;
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

  const investmentHex = (investmentId: string): string => {
    if (investmentById.get(investmentId)?.type === "FII") return FII_HEX;
    const index = cdbInvestments.findIndex((inv) => inv.id === investmentId);
    return INVESTMENT_HEX[Math.max(0, index) % INVESTMENT_HEX.length];
  };

  // Só colunas de CDBs com renda no período exibido.
  const summaryCdbColumns = cdbInvestments.filter((inv) =>
    monthlySummary.some((row) => (row.cdbValues.get(inv.id) ?? 0) > 0),
  );
  const summaryHasFii = monthlySummary.some((row) => row.fiis > 0);

  // Mês da data-base (D−1) em diante ainda está em andamento.
  const dataBaseDate = previousBusinessDay(new Date());
  const dataBaseKey = dataBaseDate.getFullYear() * 100 + dataBaseDate.getMonth() + 1;
  const isInProgressMonth = (year: number, month: number) => year * 100 + month >= dataBaseKey;

  const openPastMonths = Array.from(
    new Map(
      rows
        .filter((row) => row.year * 100 + row.month < dataBaseKey && !isPeriodClosed(row.year, row.month))
        .map((row) => [`${row.year}-${row.month}`, { year: row.year, month: row.month }]),
    ).values(),
  ).sort((a, b) => a.year - b.year || a.month - b.month);

  const handleSaved = async () => {
    setEditing(null);
    try {
      const res = await fetch("/api/returns");
      if (!res.ok) return;
      const data: MonthlyReturn[] = await res.json();
      setRawReturns(data);
      await loadReturnRevisions(revisionYear, revisionInvestmentFilter);
      setQuickEntryReload((value) => value + 1);
      publishDataSyncUpdate("returns");
    } catch (e) {
      console.error(e);
    }
  };

  // Lançamento rápido já recarrega os próprios valores; aqui atualiza o restante da página.
  const handleQuickEntrySaved = async () => {
    try {
      const res = await fetch("/api/returns");
      if (res.ok) setRawReturns((await res.json()) as MonthlyReturn[]);
      await loadReturnRevisions(revisionYear, revisionInvestmentFilter);
      setQuickEntryReload((value) => value + 1);
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

  const closePastMonths = async () => {
    if (openPastMonths.length === 0) return;
    const list = openPastMonths.map((item) => `${monthNameFull(item.month)}/${item.year}`).join(", ");
    if (
      !window.confirm(
        `Fechar ${openPastMonths.length} mês(es) anteriores?\n\n${list}\n\nMeses fechados não aceitam novos lançamentos até serem reabertos.`,
      )
    ) {
      return;
    }
    setClosingPast(true);
    const failures: string[] = [];
    for (const item of openPastMonths) {
      try {
        const res = await fetch("/api/monthly-closures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year: item.year, month: item.month, is_closed: true }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "falha");
        }
      } catch (e) {
        failures.push(`${monthNameFull(item.month)}/${item.year}: ${e instanceof Error ? e.message : "falha"}`);
      }
    }
    await refreshClosures();
    setClosingPast(false);
    setQuickEntryReload((value) => value + 1);
    if (failures.length > 0) alert(`Não foi possível fechar: ${failures.join("; ")}`);
  };

  const investmentFilterOptions = [
    { value: "all", label: "Todos os investimentos" },
    { value: "fii", label: "Todos os FIIs" },
    ...uiInvestments.map((inv) => ({
      value: inv.id,
      label: inv.type === "FII" ? inv.name : (inv.name || `CDB ${inv.institution}`),
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

      <QuickEntryPanel reloadToken={quickEntryReload} onSaved={handleQuickEntrySaved} />

      <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Resumo do mês a mês{yearFilter === "all" ? "" : ` (${yearFilter})`}
            </h3>
            <p className="text-xs text-slate-400">
              Renda lançada por investimento. Mês fechado bloqueia novas gravações.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              value={yearFilter}
              onChange={(e) => {
                setPage(1);
                setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value));
              }}
            >
              <option value="all">Todos os anos</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {closuresAvailable && openPastMonths.length > 0 ? (
              <button
                type="button"
                disabled={closingPast}
                onClick={() => void closePastMonths()}
                className="rounded-md border border-amber-500/50 px-2 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {closingPast ? "Fechando..." : `Fechar meses anteriores (${openPastMonths.length})`}
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs md:text-sm">
            <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2">Mês</th>
                {summaryCdbColumns.map((inv, idx) => (
                  <th key={inv.id} className={`px-2 py-2 text-right ${investmentTextColor(idx)}`}>
                    {inv.name || `CDB ${inv.institution}`}
                  </th>
                ))}
                {summaryHasFii ? <th className="px-2 py-2 text-right text-emerald-400">FIIs</th> : null}
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Var. M/M</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 text-right">Fechamento</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.length === 0 ? (
                <tr>
                  <td
                    colSpan={summaryCdbColumns.length + 6}
                    className="px-2 py-4 text-center text-slate-400"
                  >
                    Nenhum dado para o ano selecionado.
                  </td>
                </tr>
              ) : (
                monthlySummary.map((row, index) => {
                  const key = `${row.year}-${row.month}`;
                  const closed = isPeriodClosed(row.year, row.month);
                  const isUpdating = closureUpdatingKey === key;
                  const inProgress = isInProgressMonth(row.year, row.month);
                  const previous = index > 0 ? monthlySummary[index - 1] : null;
                  const mom =
                    !inProgress && previous && previous.total > 0
                      ? ((row.total - previous.total) / previous.total) * 100
                      : null;
                  return (
                    <tr key={key} className="border-b border-slate-800/60 last:border-0">
                      <td className="whitespace-nowrap px-2 py-2 text-slate-300">
                        {monthNameFull(row.month)}
                        {yearFilter === "all" ? `/${row.year}` : ""}
                        {inProgress ? (
                          <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                            em andamento
                          </span>
                        ) : null}
                      </td>
                      {summaryCdbColumns.map((inv, idx) => {
                        const value = row.cdbValues.get(inv.id) ?? 0;
                        return (
                          <td
                            key={inv.id}
                            className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
                              value > 0 ? `font-medium ${investmentTextColor(idx)}` : "text-slate-600"
                            }`}
                          >
                            {value > 0 ? formatCurrencyBRL(value) : "—"}
                          </td>
                        );
                      })}
                      {summaryHasFii ? (
                        <td
                          className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
                            row.fiis > 0 ? "font-medium text-emerald-400" : "text-slate-600"
                          }`}
                        >
                          {row.fiis > 0 ? formatCurrencyBRL(row.fiis) : "—"}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums text-slate-100">
                        {formatCurrencyBRL(row.total)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-2 text-right text-xs font-semibold ${
                          mom === null ? "text-slate-500" : mom > 0 ? "text-emerald-300" : mom < 0 ? "text-rose-300" : "text-slate-300"
                        }`}
                      >
                        {inProgress ? "parcial" : mom === null ? "—" : `${mom > 0 ? "▲ +" : mom < 0 ? "▼ " : ""}${mom.toFixed(1)}%`}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            closed ? "bg-slate-700/60 text-slate-200" : "bg-emerald-900/40 text-emerald-300"
                          }`}
                        >
                          {closed ? "🔒 Fechado" : "Aberto"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          disabled={isUpdating || !closuresAvailable}
                          onClick={() => toggleMonthClosure(row.year, row.month, !closed)}
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
                    </tr>
                  );
                })
              )}
            </tbody>
            {monthlySummary.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-700 bg-slate-900/50 font-bold">
                  <td className="px-2 py-2 text-xs uppercase tracking-wide text-slate-300">Total</td>
                  {summaryCdbColumns.map((inv, idx) => (
                    <td
                      key={inv.id}
                      className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${investmentTextColor(idx)}`}
                    >
                      {formatCurrencyBRL(monthlySummary.reduce((acc, row) => acc + (row.cdbValues.get(inv.id) ?? 0), 0))}
                    </td>
                  ))}
                  {summaryHasFii ? (
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-emerald-400">
                      {formatCurrencyBRL(monthlySummary.reduce((acc, row) => acc + row.fiis, 0))}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-50">
                    {formatCurrencyBRL(monthlySummary.reduce((acc, row) => acc + row.total, 0))}
                  </td>
                  <td className="px-2 py-2" colSpan={3} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
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
              value={revisionMonthKey ?? ""}
              onChange={(e) => {
                setRevisionMonthKey(e.target.value);
                setRevisionPage(1);
              }}
            >
              {availableRevisionMonths.map((m) => (
                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                  {monthNameFull(m.month)}
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
                    <XAxis
                      dataKey="seq"
                      stroke="#94a3b8"
                      minTickGap={16}
                      tickFormatter={(value) => revisionChartData[Number(value) - 1]?.day ?? ""}
                    />
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
                        if (!point) return "";
                        return `${point.timestamp} • ${point.investmentLabel}`;
                      }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "#1f2937",
                      }}
                      labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                      itemStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend
                      content={() => {
                        const seen = new Map<string, string>();
                        for (const p of revisionChartData) {
                          if (!seen.has(p.investmentLabel)) {
                            seen.set(p.investmentLabel, investmentHex(p.investmentId));
                          }
                        }
                        return (
                          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                            {Array.from(seen.entries()).map(([label, color]) => (
                              <span key={label} className="flex items-center gap-1">
                                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                                {label}
                              </span>
                            ))}
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: "#22d3ee" }} />
                              Valor atualizado
                            </span>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine yAxisId="delta" y={0} stroke="#64748b" />
                    <Bar yAxisId="delta" dataKey="delta" name="Δ atualização">
                      {revisionChartData.map((point) => (
                        <Cell
                          key={`delta-${point.seq}`}
                          fill={investmentHex(point.investmentId)}
                          fillOpacity={point.delta >= 0 ? 1 : 0.5}
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
                      dot={(props: Record<string, unknown>) => {
                        const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                        const point = revisionChartData[index];
                        if (!point) return <circle cx={cx} cy={cy} r={3} fill="#22d3ee" />;
                        return <circle cx={cx} cy={cy} r={3} fill={investmentHex(point.investmentId)} />;
                      }}
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
              <div className="mt-3 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-900/60 p-2">
                    <p className="text-[11px] text-slate-500">
                      Realizado{monthlyForecast.isCurrent && monthlyForecast.asOfDate
                        ? ` até ${monthlyForecast.asOfDate.split("-").reverse().slice(0, 2).join("/")}`
                        : ""}
                    </p>
                    <p className="text-sm font-semibold text-slate-100">{formatCurrencyBRL(monthlyForecast.realized)}</p>
                  </div>
                  <div className="rounded-md bg-slate-900/60 p-2">
                    <p className="text-[11px] text-slate-500">
                      {monthlyForecast.isCurrent ? "Fechamento projetado" : "Fechamento"}
                    </p>
                    <p className="text-sm font-semibold text-cyan-300">{formatCurrencyBRL(monthlyForecast.projected)}</p>
                    {monthlyForecast.projectedVsPrevious !== null ? (
                      <p
                        className={`text-[11px] ${
                          monthlyForecast.projectedVsPrevious >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {monthlyForecast.projectedVsPrevious >= 0 ? "▲ +" : "▼ "}
                        {monthlyForecast.projectedVsPrevious.toFixed(1)}% vs mês anterior
                      </p>
                    ) : null}
                  </div>
                </div>
                {monthlyForecast.isCurrent ? (
                  <p className="text-slate-400">
                    Ritmo recente {formatCurrencyBRL(monthlyForecast.dailyRate)}/dia útil · {monthlyForecast.elapsed} de{" "}
                    {monthlyForecast.total} dias úteis com dados · {monthlyForecast.remaining} restantes
                  </p>
                ) : null}
                <table className="min-w-full text-left">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-1">Investimento</th>
                      <th className="py-1 text-right">Realizado</th>
                      {monthlyForecast.isCurrent ? <th className="py-1 text-right">Ritmo/d.u.</th> : null}
                      <th className="py-1 text-right">{monthlyForecast.isCurrent ? "Projeção" : "Fechamento"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {monthlyForecast.items.map((item) => (
                      <tr key={item.investmentId}>
                        <td className="py-1 text-slate-300">{item.label}</td>
                        <td className="whitespace-nowrap py-1 text-right tabular-nums text-slate-200">
                          {formatCurrencyBRL(item.realized)}
                        </td>
                        {monthlyForecast.isCurrent ? (
                          <td className="whitespace-nowrap py-1 text-right tabular-nums text-slate-400">
                            {item.dailyRate > 0 ? formatCurrencyBRL(item.dailyRate) : "—"}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap py-1 text-right tabular-nums text-cyan-300">
                          {formatCurrencyBRL(item.projected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-500">Mesmo cálculo do Dashboard e dos Insights.</p>
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
              ) : filteredRevisionRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                    Nenhuma revisão encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                (() => {
                  const totalRevisionPages = Math.max(1, Math.ceil(filteredRevisionRows.length / revisionPageSize));
                  const safeRevisionPage = Math.min(revisionPage, totalRevisionPages);
                  const revisionStart = (safeRevisionPage - 1) * revisionPageSize;
                  const revisionPageRows = filteredRevisionRows.slice(revisionStart, revisionStart + revisionPageSize);
                  return revisionPageRows.map((row) => (
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
                ));
                })()
              )}
            </tbody>
          </table>
          {filteredRevisionRows.length > revisionPageSize && (
            <div className="mt-2 flex items-center justify-end gap-3 text-xs text-slate-400">
              <span>Mostrando {Math.min(revisionPage * revisionPageSize, filteredRevisionRows.length)} de {filteredRevisionRows.length}</span>
              <button
                type="button"
                disabled={revisionPage === 1}
                onClick={() => setRevisionPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Anterior
              </button>
              <span>Página {revisionPage} / {Math.ceil(filteredRevisionRows.length / revisionPageSize)}</span>
              <button
                type="button"
                disabled={revisionPage >= Math.ceil(filteredRevisionRows.length / revisionPageSize)}
                onClick={() => setRevisionPage((p) => p + 1)}
                className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
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
            (() => {
              const totalEventPages = Math.max(1, Math.ceil(cashEvents.length / eventPageSize));
              const safeEventPage = Math.min(eventPage, totalEventPages);
              const eventStart = (safeEventPage - 1) * eventPageSize;
              const eventPageRows = cashEvents.slice(eventStart, eventStart + eventPageSize);
              return (
                <>
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
                  {eventPageRows.map((event) => {
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
            {cashEvents.length > eventPageSize && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-slate-400">
                <span>Mostrando {Math.min(safeEventPage * eventPageSize, cashEvents.length)} de {cashEvents.length}</span>
                <button
                  type="button"
                  disabled={safeEventPage === 1}
                  onClick={() => setEventPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  Anterior
                </button>
                <span>Página {safeEventPage} / {totalEventPages}</span>
                <button
                  type="button"
                  disabled={safeEventPage >= totalEventPages}
                  onClick={() => setEventPage((p) => p + 1)}
                  className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            )}
                </>
              );
            })()
          )}
        </div>
      </div>

      {cashEventsSummary.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">
            Resumo de eventos de caixa ({eventYear})
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Mês</th>
                  <th className="px-2 py-2">Investimento</th>
                  <th className="px-2 py-2 text-emerald-400">Aportes</th>
                  <th className="px-2 py-2 text-amber-400">Resgates</th>
                  <th className="px-2 py-2 text-rose-400">Impostos</th>
                  <th className="px-2 py-2 text-rose-400">Taxas</th>
                  <th className="px-2 py-2 font-bold">Fluxo Líquido</th>
                </tr>
              </thead>
              <tbody>
                {cashEventsSummary.map((row) => (
                  <tr key={`${row.month}-${row.investmentId}`} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-2 py-2 text-slate-300">{monthNameFull(row.month)}</td>
                    <td className="px-2 py-2 text-slate-200">{row.investmentLabel}</td>
                    <td className="px-2 py-2 text-emerald-400">{row.aportes > 0 ? formatCurrencyBRL(row.aportes) : "—"}</td>
                    <td className="px-2 py-2 text-amber-400">{row.resgates > 0 ? formatCurrencyBRL(row.resgates) : "—"}</td>
                    <td className="px-2 py-2 text-rose-400">{row.impostos > 0 ? formatCurrencyBRL(row.impostos) : "—"}</td>
                    <td className="px-2 py-2 text-rose-400">{row.taxas > 0 ? formatCurrencyBRL(row.taxas) : "—"}</td>
                    <td className={`px-2 py-2 font-bold ${row.fluxo >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {formatCurrencyBRL(row.fluxo)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600 bg-slate-900/50">
                  <td className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-slate-300" colSpan={2}>Total</td>
                  <td className="px-2 py-2 font-bold text-emerald-400">
                    {formatCurrencyBRL(cashEventsSummary.reduce((acc, r) => acc + r.aportes, 0))}
                  </td>
                  <td className="px-2 py-2 font-bold text-amber-400">
                    {formatCurrencyBRL(cashEventsSummary.reduce((acc, r) => acc + r.resgates, 0))}
                  </td>
                  <td className="px-2 py-2 font-bold text-rose-400">
                    {formatCurrencyBRL(cashEventsSummary.reduce((acc, r) => acc + r.impostos, 0))}
                  </td>
                  <td className="px-2 py-2 font-bold text-rose-400">
                    {formatCurrencyBRL(cashEventsSummary.reduce((acc, r) => acc + r.taxas, 0))}
                  </td>
                  <td className={`px-2 py-2 font-extrabold ${cashEventsSummary.reduce((acc, r) => acc + r.fluxo, 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatCurrencyBRL(cashEventsSummary.reduce((acc, r) => acc + r.fluxo, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {cashEventsInvestmentTotals.length > 0 && (
            <div className="mt-4 overflow-x-auto border-t border-slate-700 pt-4">
              <h4 className="mb-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">Total por investimento ({eventYear})</h4>
              <table className="min-w-full text-left text-xs md:text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Investimento</th>
                    <th className="px-2 py-2 text-emerald-400">Aportes</th>
                    <th className="px-2 py-2 text-amber-400">Resgates</th>
                    <th className="px-2 py-2 text-rose-400">Impostos</th>
                    <th className="px-2 py-2 text-rose-400">Taxas</th>
                    <th className="px-2 py-2 font-bold">Fluxo Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {cashEventsInvestmentTotals.map((row) => (
                    <tr key={row.investmentLabel} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-2 py-2 font-medium text-slate-200">{row.investmentLabel}</td>
                      <td className="px-2 py-2 text-emerald-400">{row.aportes > 0 ? formatCurrencyBRL(row.aportes) : "—"}</td>
                      <td className="px-2 py-2 text-amber-400">{row.resgates > 0 ? formatCurrencyBRL(row.resgates) : "—"}</td>
                      <td className="px-2 py-2 text-rose-400">{row.impostos > 0 ? formatCurrencyBRL(row.impostos) : "—"}</td>
                      <td className="px-2 py-2 text-rose-400">{row.taxas > 0 ? formatCurrencyBRL(row.taxas) : "—"}</td>
                      <td className={`px-2 py-2 font-bold ${row.fluxo >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {formatCurrencyBRL(row.fluxo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <details className="group rounded-xl border border-slate-800 bg-surface/60 p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-200">
          Lançamentos detalhados
          <span className="ml-2 text-xs font-normal text-slate-500">
            lista completa, edição de um lançamento e meses anteriores
          </span>
        </summary>
        <div className="mt-4">
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
                            : investmentTextColor(Math.max(0, cdbInvestments.findIndex((inv) => inv.id === row.investmentId)))
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
        </div>
      </details>
    </div>
  );
}
