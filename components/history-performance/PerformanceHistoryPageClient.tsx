"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Investment, MonthlyReturn } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  initialYear: number;
  initialMonth: number;
}

interface TimelinePoint {
  key: string;
  year: number;
  month: number;
  label: string;
  total: number;
}

interface ComparisonPoint {
  month: number;
  label: string;
  yearAValue: number;
  yearBValue: number;
  deltaValue: number;
}

interface MonthlyPerformancePoint {
  key: string;
  year: number;
  month: number;
  label: string;
  cdbItau: number;
  cdbSantander: number;
  fii: number;
  total: number;
  varMoMPercent: number | null;
  varMoMValue: number | null;
}

function normalizeInvestmentLabel(investment: Investment): string {
  if (investment.type === "CDB" && investment.institution === "Itaú") {
    return "CDB Itaú";
  }
  if (investment.type === "CDB") {
    return "CDB Santander";
  }
  return investment.name || "Dividendos FIIs";
}

function toMonthRange(startMonth: number, endMonth: number): { start: number; end: number } {
  return {
    start: Math.min(startMonth, endMonth),
    end: Math.max(startMonth, endMonth),
  };
}

function formatAxisCurrencyTick(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function shortMonthYearLabel(month: number, year: number): string {
  const monthShort = monthLabel(month).replace(".", "");
  const yearShort = String(year).slice(-2);
  return `${monthShort}/${yearShort}`;
}

function formatDeltaShort(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return `${sign}${abs.toFixed(0)}`;
}

function formatTimelineShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `+${(abs / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return `+${abs.toFixed(0)}`;
}

export function PerformanceHistoryPageClient({ initialYear, initialMonth }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [returns, setReturns] = useState<MonthlyReturn[]>([]);

  const [investmentFilter, setInvestmentFilter] = useState<string>("all");
  const [yearA, setYearA] = useState(initialYear);
  const [yearB, setYearB] = useState(initialYear - 1);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(initialMonth);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [invRes, retRes] = await Promise.all([
          fetch("/api/investments", { cache: "no-store" }),
          fetch("/api/returns", { cache: "no-store" }),
        ]);
        if (!invRes.ok || !retRes.ok) {
          throw new Error("Erro ao carregar histórico de performance.");
        }
        const invData: Investment[] = await invRes.json();
        const retData: MonthlyReturn[] = await retRes.json();
        setInvestments(invData);
        setReturns(retData);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro inesperado ao carregar histórico.",
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const investmentById = useMemo(() => {
    const map = new Map<string, Investment>();
    for (const investment of investments) {
      map.set(investment.id, investment);
    }
    return map;
  }, [investments]);

  const investmentOptions = useMemo(() => {
    return investments.map((investment) => ({
      id: investment.id,
      label: `${investment.type} • ${investment.institution} • ${normalizeInvestmentLabel(investment)}`,
    }));
  }, [investments]);

  const filteredReturns = useMemo(() => {
    if (investmentFilter === "all") {
      return returns;
    }
    return returns.filter((entry) => entry.investment_id === investmentFilter);
  }, [returns, investmentFilter]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    filteredReturns.forEach((entry) => set.add(entry.year));
    if (set.size === 0) {
      set.add(initialYear);
      set.add(initialYear - 1);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [filteredReturns, initialYear]);

  useEffect(() => {
    if (!availableYears.includes(yearA)) {
      setYearA(availableYears[0]);
    }
    const expectedYearB = yearA - 1;
    if (!availableYears.includes(yearB)) {
      if (availableYears.includes(expectedYearB)) {
        setYearB(expectedYearB);
      } else if (availableYears.length > 1) {
        setYearB(availableYears[1]);
      } else {
        setYearB(availableYears[0]);
      }
    }
  }, [availableYears, yearA, yearB]);

  const timelineData = useMemo<TimelinePoint[]>(() => {
    const grouped = new Map<string, TimelinePoint>();
    for (const entry of filteredReturns) {
      const key = `${entry.year}-${entry.month}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.total += Number(entry.income_value ?? 0);
        continue;
      }
      grouped.set(key, {
        key,
        year: entry.year,
        month: entry.month,
        label: shortMonthYearLabel(entry.month, entry.year),
        total: Number(entry.income_value ?? 0),
      });
    }
    return Array.from(grouped.values()).sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );
  }, [filteredReturns]);

  const monthlyPerformanceData = useMemo<MonthlyPerformancePoint[]>(() => {
    const grouped = new Map<string, MonthlyPerformancePoint>();
    for (const entry of filteredReturns) {
      const investment = investmentById.get(entry.investment_id);
      if (!investment) continue;

      const key = `${entry.year}-${entry.month}`;
      const existing = grouped.get(key) ?? {
        key,
        year: entry.year,
        month: entry.month,
        label: shortMonthYearLabel(entry.month, entry.year),
        cdbItau: 0,
        cdbSantander: 0,
        fii: 0,
        total: 0,
        varMoMPercent: null,
        varMoMValue: null,
      };

      const income = Number(entry.income_value ?? 0);
      if (investment.type === "FII") {
        existing.fii += income;
      } else if (investment.institution === "Itaú") {
        existing.cdbItau += income;
      } else {
        existing.cdbSantander += income;
      }

      existing.total = existing.cdbItau + existing.cdbSantander + existing.fii;
      grouped.set(key, existing);
    }

    const sorted = Array.from(grouped.values()).sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );

    return sorted.map((point, index) => {
      if (index === 0) {
        return point;
      }
      const previousTotal = sorted[index - 1].total;
      const delta = point.total - previousTotal;
      return {
        ...point,
        varMoMValue: delta,
        varMoMPercent: previousTotal > 0 ? (delta / previousTotal) * 100 : null,
      };
    });
  }, [filteredReturns, investmentById]);

  const latestMonthlyPerformance = useMemo(() => {
    if (monthlyPerformanceData.length === 0) {
      return null;
    }
    return monthlyPerformanceData[monthlyPerformanceData.length - 1];
  }, [monthlyPerformanceData]);

  const timelineSummary = useMemo(() => {
    const total = timelineData.reduce((acc, point) => acc + point.total, 0);
    const average = timelineData.length > 0 ? total / timelineData.length : 0;
    const last = timelineData[timelineData.length - 1]?.total ?? 0;
    return { total, average, last };
  }, [timelineData]);

  const monthRange = useMemo(
    () => toMonthRange(startMonth, endMonth),
    [startMonth, endMonth],
  );

  const comparisonData = useMemo<ComparisonPoint[]>(() => {
    const byYearMonth = new Map<string, number>();
    for (const entry of filteredReturns) {
      const key = `${entry.year}-${entry.month}`;
      const next = (byYearMonth.get(key) ?? 0) + Number(entry.income_value ?? 0);
      byYearMonth.set(key, next);
    }

    const series: ComparisonPoint[] = [];
    for (let month = monthRange.start; month <= monthRange.end; month += 1) {
      const yearAValue = byYearMonth.get(`${yearA}-${month}`) ?? 0;
      const yearBValue = byYearMonth.get(`${yearB}-${month}`) ?? 0;
      series.push({
        month,
        label: monthLabel(month),
        yearAValue,
        yearBValue,
        deltaValue: yearAValue - yearBValue,
      });
    }
    return series;
  }, [filteredReturns, monthRange.end, monthRange.start, yearA, yearB]);

  const comparisonSummary = useMemo(() => {
    const totalA = comparisonData.reduce((acc, point) => acc + point.yearAValue, 0);
    const totalB = comparisonData.reduce((acc, point) => acc + point.yearBValue, 0);
    const delta = totalA - totalB;
    const deltaPct = totalB > 0 ? (delta / totalB) * 100 : null;
    return {
      totalA,
      totalB,
      delta,
      deltaPct,
    };
  }, [comparisonData]);

  const selectedInvestmentLabel =
    investmentFilter === "all"
      ? "Todos os investimentos"
      : (() => {
          const found = investmentById.get(investmentFilter);
          if (!found) return "Investimento";
          return `${found.type} • ${found.institution} • ${normalizeInvestmentLabel(found)}`;
        })();

  const deltaValueClass =
    comparisonSummary.delta > 0
      ? "text-emerald-300"
      : comparisonSummary.delta < 0
        ? "text-rose-300"
        : "text-slate-100";

  const deltaPercentClass =
    comparisonSummary.deltaPct !== null && comparisonSummary.deltaPct > 0
      ? "text-emerald-300"
      : comparisonSummary.deltaPct !== null && comparisonSummary.deltaPct < 0
        ? "text-rose-300"
        : "text-slate-100";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Histórico de Performance</h2>
          <p className="text-sm text-slate-400">
            Linha do tempo mensal e comparação de períodos por investimento.
          </p>
        </div>
        <div className="w-full max-w-sm">
          <label className="mb-1 block text-xs text-slate-400">Filtro por investimento</label>
          <select
            value={investmentFilter}
            onChange={(e) => setInvestmentFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="all">Todos os investimentos</option>
            {investmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <Card className="h-[360px]">
        <h3 className="text-sm font-semibold text-slate-100">Linha do tempo mensal</h3>
        <p className="mb-2 text-xs text-slate-400">{selectedInvestmentLabel}</p>
        {loading ? (
          <p className="text-xs text-slate-400">Carregando linha do tempo...</p>
        ) : timelineData.length === 0 ? (
          <p className="text-xs text-slate-400">Sem dados para o filtro selecionado.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timelineData} margin={{ top: 8, right: 8, left: 18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                interval={0}
                tickMargin={8}
                tick={{ fontSize: 11 }}
                angle={-35}
                textAnchor="end"
                height={56}
              />
              <YAxis
                stroke="#94a3b8"
                width={84}
                tickMargin={6}
                tickFormatter={formatAxisCurrencyTick}
              />
              <Tooltip
                labelFormatter={(label) => `Competência: ${String(label)}`}
                formatter={(value: number) => [formatCurrencyBRL(value), "Total"]}
                contentStyle={{ backgroundColor: "#020617", borderColor: "#1f2937" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 5 }}
              >
                <LabelList
                  dataKey="total"
                  content={(props: any) => {
                    const value =
                      typeof props.value === "number"
                        ? props.value
                        : Number(props.value ?? 0);
                    if (!Number.isFinite(value)) return null;
                    const x = Number(props.x ?? 0);
                    const y = Number(props.y ?? 0);
                    return (
                      <text
                        x={x}
                        y={y - 10}
                        textAnchor="middle"
                        fill="#fbbf24"
                        fontSize={11}
                        fontWeight={600}
                      >
                        {formatTimelineShort(value)}
                      </text>
                    );
                  }}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="h-[430px]">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Desempenho histórico mensal</h3>
            <p className="text-xs text-slate-400">
              Composição por tema + total mensal e variação M/M (%), usando os dados de retornos.
            </p>
          </div>
          {latestMonthlyPerformance ? (
            <div className="text-right text-xs">
              <p className="text-slate-400">
                Última variação M/M (R$):{" "}
                <span
                  className={`font-semibold ${
                    (latestMonthlyPerformance.varMoMValue ?? 0) > 0
                      ? "text-emerald-300"
                      : (latestMonthlyPerformance.varMoMValue ?? 0) < 0
                        ? "text-rose-300"
                        : "text-slate-100"
                  }`}
                >
                  {formatCurrencyBRL(latestMonthlyPerformance.varMoMValue ?? 0)}
                </span>
              </p>
            </div>
          ) : null}
        </div>
        {loading ? (
          <p className="text-xs text-slate-400">Carregando dados de desempenho mensal...</p>
        ) : monthlyPerformanceData.length === 0 ? (
          <p className="text-xs text-slate-400">Sem dados para montar o gráfico mensal.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyPerformanceData} margin={{ top: 8, right: 8, left: 18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                interval={0}
                tickMargin={8}
                tick={{ fontSize: 11 }}
                angle={-35}
                textAnchor="end"
                height={56}
              />
              <YAxis
                yAxisId="value"
                stroke="#94a3b8"
                width={84}
                tickMargin={6}
                tickFormatter={formatAxisCurrencyTick}
              />
              <YAxis
                yAxisId="percent"
                orientation="right"
                stroke="#94a3b8"
                width={56}
                tickMargin={6}
                tickFormatter={(value: number) => `${value.toFixed(1)}%`}
              />
              <ReferenceLine yAxisId="percent" y={0} stroke="#334155" strokeDasharray="4 4" />
              <Tooltip
                labelFormatter={(label) => `Competência: ${String(label)}`}
                formatter={(value, key) => {
                  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                  if (key === "cdbItau") return [formatCurrencyBRL(numericValue), "CDB Itaú"];
                  if (key === "cdbSantander") {
                    return [formatCurrencyBRL(numericValue), "CDB Santander"];
                  }
                  if (key === "fii") return [formatCurrencyBRL(numericValue), "Dividendos FIIs"];
                  if (key === "total") return [formatCurrencyBRL(numericValue), "Total mensal"];
                  if (key === "varMoMPercent") return [formatPercentage(numericValue), "VAR (M/M %)"];
                  return [formatCurrencyBRL(numericValue), "VAR (M/M R$)"];
                }}
                contentStyle={{ backgroundColor: "#020617", borderColor: "#1f2937" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Legend
                formatter={(value) => {
                  if (value === "cdbItau") return "CDB Itaú";
                  if (value === "cdbSantander") return "CDB Santander";
                  if (value === "fii") return "Dividendos FIIs";
                  if (value === "total") return "Total mensal";
                  return "VAR (M/M %)";
                }}
              />
              <Bar yAxisId="value" dataKey="cdbItau" name="cdbItau" stackId="income" fill="#f97316" />
              <Bar
                yAxisId="value"
                dataKey="cdbSantander"
                name="cdbSantander"
                stackId="income"
                fill="#fb7185"
              />
              <Bar yAxisId="value" dataKey="fii" name="fii" stackId="income" fill="#6ee7b7" />
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="total"
                name="total"
                stroke="#e2e8f0"
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="percent"
                type="monotone"
                dataKey="varMoMPercent"
                name="varMoMPercent"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 2 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-slate-400">Total do histórico filtrado</p>
          <p className="text-xl font-semibold text-slate-50">{formatCurrencyBRL(timelineSummary.total)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">Média mensal</p>
          <p className="text-xl font-semibold text-slate-50">{formatCurrencyBRL(timelineSummary.average)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">Última competência</p>
          <p className="text-xl font-semibold text-slate-50">{formatCurrencyBRL(timelineSummary.last)}</p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Ano A</label>
            <select
              value={yearA}
              onChange={(e) => setYearA(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Ano B</label>
            <select
              value={yearB}
              onChange={(e) => setYearB(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Mês inicial</label>
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Mês final</label>
            <select
              value={endMonth}
              onChange={(e) => setEndMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-700 bg-slate-900/40">
            <p className="text-xs text-slate-400">Total {yearA}</p>
            <p className="text-lg font-semibold text-cyan-300">{formatCurrencyBRL(comparisonSummary.totalA)}</p>
          </Card>
          <Card className="border-slate-700 bg-slate-900/40">
            <p className="text-xs text-slate-400">Total {yearB}</p>
            <p className="text-lg font-semibold text-slate-100">{formatCurrencyBRL(comparisonSummary.totalB)}</p>
          </Card>
          <Card className="border-slate-700 bg-slate-900/40">
            <p className="text-xs text-slate-400">Variação (R$)</p>
            <p className={`text-lg font-semibold ${deltaValueClass}`}>
              {formatCurrencyBRL(comparisonSummary.delta)}
            </p>
          </Card>
          <Card className="border-slate-700 bg-slate-900/40">
            <p className="text-xs text-slate-400">Variação (%)</p>
            <p className={`text-lg font-semibold ${deltaPercentClass}`}>
              {formatPercentage(comparisonSummary.deltaPct)}
            </p>
          </Card>
        </div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={comparisonData} margin={{ top: 18, right: 18, left: 18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" stroke="#94a3b8" minTickGap={24} tickMargin={8} />
              <YAxis
                yAxisId="value"
                stroke="#94a3b8"
                width={84}
                tickMargin={6}
                tickFormatter={formatAxisCurrencyTick}
              />
              <YAxis
                yAxisId="delta"
                orientation="right"
                stroke="#94a3b8"
                width={84}
                tickMargin={6}
                tickFormatter={formatAxisCurrencyTick}
              />
              <ReferenceLine yAxisId="delta" y={0} stroke="#334155" strokeDasharray="4 4" />
              <Tooltip
                labelFormatter={(label) => `Mês: ${String(label)}`}
                formatter={(value, key: string) => {
                  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                  if (key === "yearAValue") return [formatCurrencyBRL(numericValue), String(yearA)];
                  if (key === "yearBValue") return [formatCurrencyBRL(numericValue), String(yearB)];
                  return [formatCurrencyBRL(numericValue), `Δ R$ (${yearA} - ${yearB})`];
                }}
                contentStyle={{ backgroundColor: "#020617", borderColor: "#1f2937" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Legend
                formatter={(value) => {
                  if (value === "yearAValue") return String(yearA);
                  if (value === "yearBValue") return String(yearB);
                  return `Δ R$ (${yearA} - ${yearB})`;
                }}
              />
              <Bar yAxisId="value" dataKey="yearAValue" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={22}>
              </Bar>
              <Bar yAxisId="value" dataKey="yearBValue" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={22}>
              </Bar>
              <Line
                yAxisId="delta"
                type="monotone"
                dataKey="deltaValue"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="deltaValue"
              >
                <LabelList
                  dataKey="deltaValue"
                  fill="#fbbf24"
                  content={(props: any) => {
                    const value =
                      typeof props.value === "number" ? props.value : Number(props.value ?? 0);
                    if (!Number.isFinite(value)) return null;
                    const x = Number(props.x ?? 0);
                    const y = Number(props.y ?? 0);
                    const yLabel = value >= 0 ? y - 10 : y + 16;
                    return (
                      <text
                        x={x}
                        y={yLabel}
                        textAnchor="middle"
                        fill="#fbbf24"
                        fontSize={10}
                        fontWeight={600}
                      >
                        {formatDeltaShort(value)}
                      </text>
                    );
                  }}
                />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
