"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PerformanceHistoryMonth, PerformanceHistoryPayload } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  initialYear: number;
  initialMonth: number;
}

// Cores por investimento (hex para o Recharts e style inline; nada de classes Tailwind dinâmicas).
const INVESTMENT_COLORS = ["#fb923c", "#f472b6", "#22d3ee", "#a78bfa", "#facc15", "#60a5fa", "#f87171", "#2dd4bf"];
const FII_COLOR = "#34d399";
const PROJECTION_COLOR = "#475569";
const TOOLTIP_STYLE = { backgroundColor: "#020617", borderColor: "#1f2937" };
const SELECT_CLASS =
  "rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent";

function shortMonthYearLabel(month: number, year: number): string {
  return `${monthLabel(month)}/${String(year).slice(-2)}`;
}

function formatAxisCurrencyTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",")}k`;
  return value.toFixed(0);
}

function signedCurrency(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCurrencyBRL(Math.abs(value))}`;
}

function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${formatPercentage(value)}`;
}

function toneClass(value: number | null): string {
  if (value === null) return "text-slate-300";
  return value >= 0 ? "text-emerald-300" : "text-rose-300";
}

function sumFor(values: Record<string, number> | null, ids: string[]): number {
  if (!values) return 0;
  return ids.reduce((acc, id) => acc + (values[id] ?? 0), 0);
}

export function PerformanceHistoryPageClient({ initialYear, initialMonth }: Props) {
  const [data, setData] = useState<PerformanceHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [investmentFilter, setInvestmentFilter] = useState<string>("all");
  const [yearA, setYearA] = useState(initialYear);
  const [yearB, setYearB] = useState(initialYear - 1);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(initialMonth);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/performance/history", { cache: "no-store" });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "Erro ao carregar histórico de performance.");
        }
        setData((await res.json()) as PerformanceHistoryPayload);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado ao carregar histórico.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const investments = useMemo(() => data?.investments ?? [], [data]);
  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    let index = 0;
    for (const inv of investments) {
      if (inv.type === "FII") {
        map.set(inv.id, FII_COLOR);
      } else {
        map.set(inv.id, INVESTMENT_COLORS[index % INVESTMENT_COLORS.length]);
        index += 1;
      }
    }
    return map;
  }, [investments]);
  const labelById = useMemo(() => new Map(investments.map((inv) => [inv.id, inv.label])), [investments]);

  const selectedIds = useMemo(
    () => (investmentFilter === "all" ? investments.map((inv) => inv.id) : [investmentFilter]),
    [investmentFilter, investments],
  );

  const months: PerformanceHistoryMonth[] = useMemo(() => data?.months ?? [], [data]);
  const closedMonths = useMemo(() => months.filter((m) => m.status === "closed"), [months]);
  const currentMonthPoint = months.find((m) => m.status === "in_progress") ?? null;

  const monthTotal = (m: PerformanceHistoryMonth) => sumFor(m.byInvestment, selectedIds);
  const currentRealized = currentMonthPoint ? monthTotal(currentMonthPoint) : 0;
  const currentProjected =
    currentMonthPoint?.projectedByInvestment ? sumFor(currentMonthPoint.projectedByInvestment, selectedIds) : null;

  // Resumo: últimos 12 meses fechados vs os 12 anteriores.
  const summary = useMemo(() => {
    const totals = closedMonths.map((m) => ({ m, total: sumFor(m.byInvestment, selectedIds) }));
    const last12 = totals.slice(-12);
    const prev12 = totals.slice(-24, -12);
    const last12Total = last12.reduce((acc, item) => acc + item.total, 0);
    const prev12Total = prev12.reduce((acc, item) => acc + item.total, 0);
    const best = totals.reduce<{ m: PerformanceHistoryMonth; total: number } | null>(
      (acc, item) => (acc === null || item.total > acc.total ? item : acc),
      null,
    );
    const firstWithIncome = totals.find((item) => item.total > 0) ?? null;
    return {
      last12Total,
      last12Average: last12.length > 0 ? last12Total / last12.length : 0,
      last12Count: last12.length,
      growthPercent: prev12.length === 12 && prev12Total > 0 ? (last12Total / prev12Total - 1) * 100 : null,
      prev12Total,
      totalSinceStart: totals.reduce((acc, item) => acc + item.total, 0),
      firstMonth: firstWithIncome?.m ?? null,
      best,
    };
  }, [closedMonths, selectedIds]);

  // Renda por ano; o ano atual traz o realizado e a projeção de fechamento.
  const yearly = useMemo(() => {
    const byYear = new Map<number, number>();
    for (const m of months) {
      byYear.set(m.year, (byYear.get(m.year) ?? 0) + sumFor(m.byInvestment, selectedIds));
    }
    const currentYear = data?.currentYear ?? initialYear;
    const closedCurrentYear = closedMonths
      .filter((m) => m.year === currentYear)
      .reduce((acc, m) => acc + sumFor(m.byInvestment, selectedIds), 0);
    const projectedYear =
      currentProjected !== null && data
        ? closedCurrentYear +
          currentProjected +
          (currentProjected / Math.max(1, data.currentMonthBusinessDays)) * data.remainingYearBusinessDays
        : null;
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    return years.map((year, index) => {
      const realized = byYear.get(year) ?? 0;
      const isCurrent = year === currentYear;
      const previous = index > 0 ? byYear.get(years[index - 1]) ?? 0 : 0;
      const reference = isCurrent ? projectedYear ?? realized : realized;
      return {
        year,
        label: String(year),
        realized,
        isCurrent,
        projectedRemaining: isCurrent && projectedYear !== null ? Math.max(0, projectedYear - realized) : 0,
        projectedYear: isCurrent ? projectedYear : null,
        deltaPercent: index > 0 && previous > 0 ? (reference / previous - 1) * 100 : null,
      };
    });
  }, [months, closedMonths, selectedIds, currentProjected, data, initialYear]);

  // Linha do tempo: barras por investimento + média móvel de 12 meses (só meses fechados).
  const visibleInvestments = useMemo(
    () =>
      investments.filter(
        (inv) => selectedIds.includes(inv.id) && months.some((m) => (m.byInvestment[inv.id] ?? 0) > 0),
      ),
    [investments, selectedIds, months],
  );
  const timelineData = useMemo(() => {
    const closedTotals: number[] = [];
    return months.map((m) => {
      const total = sumFor(m.byInvestment, selectedIds);
      const point: Record<string, number | string | null> = {
        key: `${m.year}-${m.month}`,
        label: `${shortMonthYearLabel(m.month, m.year)}${m.status === "in_progress" ? "*" : ""}`,
        total,
        projecao: null,
        media12m: null,
      };
      for (const inv of visibleInvestments) point[inv.id] = m.byInvestment[inv.id] ?? 0;
      if (m.status === "closed") {
        closedTotals.push(total);
        if (closedTotals.length >= 12) {
          point.media12m = closedTotals.slice(-12).reduce((acc, value) => acc + value, 0) / 12;
        }
      } else if (m.projectedByInvestment) {
        point.projecao = Math.max(0, sumFor(m.projectedByInvestment, selectedIds) - total);
      }
      return point;
    });
  }, [months, selectedIds, visibleInvestments]);

  // Composição da renda por ano.
  const composition = useMemo(() => {
    const byYear = new Map<number, Map<string, number>>();
    for (const m of months) {
      const bucket = byYear.get(m.year) ?? new Map<string, number>();
      for (const id of selectedIds) bucket.set(id, (bucket.get(id) ?? 0) + (m.byInvestment[id] ?? 0));
      byYear.set(m.year, bucket);
    }
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, bucket]) => {
        const total = Array.from(bucket.values()).reduce((acc, value) => acc + value, 0);
        return {
          year,
          total,
          parts: Array.from(bucket.entries())
            .filter(([, value]) => value > 0)
            .map(([id, value]) => ({ id, value, share: total > 0 ? (value / total) * 100 : 0 })),
        };
      });
  }, [months, selectedIds]);

  // Comparação entre anos (o mês em andamento fica fora dos totais).
  const availableYears = useMemo(
    () => Array.from(new Set(months.map((m) => m.year))).sort((a, b) => b - a),
    [months],
  );
  useEffect(() => {
    if (availableYears.length === 0) return;
    if (!availableYears.includes(yearA)) setYearA(availableYears[0]);
    if (!availableYears.includes(yearB)) setYearB(availableYears[1] ?? availableYears[0]);
  }, [availableYears, yearA, yearB]);

  const comparison = useMemo(() => {
    const start = Math.min(startMonth, endMonth);
    const end = Math.max(startMonth, endMonth);
    const find = (year: number, month: number) => months.find((m) => m.year === year && m.month === month) ?? null;
    const rows = [];
    let totalA = 0;
    let totalB = 0;
    let hasPartial = false;
    for (let month = start; month <= end; month += 1) {
      const a = find(yearA, month);
      const b = find(yearB, month);
      const partial = a?.status === "in_progress" || b?.status === "in_progress";
      const valueA = a ? sumFor(a.byInvestment, selectedIds) : 0;
      const valueB = b ? sumFor(b.byInvestment, selectedIds) : 0;
      if (partial) {
        hasPartial = true;
      } else {
        totalA += valueA;
        totalB += valueB;
      }
      rows.push({ month, label: `${monthLabel(month)}${partial ? "*" : ""}`, valueA, valueB, partial });
    }
    return {
      rows,
      totalA,
      totalB,
      delta: totalA - totalB,
      deltaPercent: totalB > 0 ? (totalA / totalB - 1) * 100 : null,
      hasPartial,
    };
  }, [months, yearA, yearB, startMonth, endMonth, selectedIds]);

  const selectedLabel =
    investmentFilter === "all" ? "Todos os investimentos" : labelById.get(investmentFilter) ?? "Investimento";
  const visibleGaps = (data?.gaps ?? []).filter((gap) => selectedIds.includes(gap.investmentId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Histórico de Performance</h2>
          <p className="text-sm text-slate-400">
            Evolução da renda passiva ao longo dos anos: tendência, renda por ano, composição e comparação entre
            períodos.
          </p>
        </div>
        <div className="min-w-[240px]">
          <label className="mb-1 block text-xs text-slate-400">Filtro por investimento</label>
          <select
            value={investmentFilter}
            onChange={(e) => setInvestmentFilter(e.target.value)}
            className={`w-full ${SELECT_CLASS}`}
          >
            <option value="all">Todos os investimentos</option>
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.label} ({inv.institution}){inv.active ? "" : " · encerrado"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-400">Carregando histórico...</p> : null}

      {data && (visibleGaps.length > 0 || data.warnings.length > 0) ? (
        <Card>
          <ul className="space-y-1 text-xs text-amber-300">
            {visibleGaps.map((gap) => (
              <li key={gap.investmentId}>
                • {gap.label}: sem renda lançada em{" "}
                {gap.months.map((m) => shortMonthYearLabel(m.month, m.year)).join(", ")}. Se houve renda nesses
                meses, ela não aparece no histórico.
              </li>
            ))}
            {data.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <p className="text-xs text-slate-400">Renda nos últimos 12 meses</p>
            <p className="text-2xl font-bold text-slate-50">{formatCurrencyBRL(summary.last12Total)}</p>
            <p className="mt-1 text-xs text-slate-400">
              Média de {formatCurrencyBRL(summary.last12Average)}/mês ({summary.last12Count} meses fechados)
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Crescimento vs 12 meses anteriores</p>
            <p className={`text-2xl font-bold ${toneClass(summary.growthPercent)}`}>
              {signedPercent(summary.growthPercent)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              12 meses anteriores: {formatCurrencyBRL(summary.prev12Total)}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Renda acumulada no histórico</p>
            <p className="text-2xl font-bold text-emerald-300">
              {formatCurrencyBRL(summary.totalSinceStart + currentRealized)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {summary.firstMonth
                ? `Desde ${shortMonthYearLabel(summary.firstMonth.month, summary.firstMonth.year)}`
                : "Sem lançamentos"}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Melhor mês</p>
            <p className="text-2xl font-bold text-cyan-300">
              {summary.best ? formatCurrencyBRL(summary.best.total) : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {summary.best ? shortMonthYearLabel(summary.best.m.month, summary.best.m.year) : "—"}
              {currentMonthPoint
                ? ` · mês atual: ${formatCurrencyBRL(currentRealized)} realizado${
                    currentProjected !== null ? `, projeção ${formatCurrencyBRL(currentProjected)}` : ""
                  }`
                : ""}
            </p>
          </Card>
        </div>
      ) : null}

      {data ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-100">Linha do tempo mensal</h3>
          <p className="mb-2 text-xs text-slate-400">
            {selectedLabel}. Barras = renda de cada investimento; linha = média móvel de 12 meses (tendência).
            * mês em andamento: realizado + projeção de fechamento (cinza).
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timelineData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} minTickGap={16} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatAxisCurrencyTick} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => {
                    if (name === "media12m") return [formatCurrencyBRL(value), "Média móvel 12m"];
                    if (name === "projecao") return [formatCurrencyBRL(value), "Projeção (restante do mês)"];
                    return [formatCurrencyBRL(value), labelById.get(name) ?? name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) =>
                    value === "media12m"
                      ? "Média móvel 12m"
                      : value === "projecao"
                        ? "Projeção do mês"
                        : labelById.get(value) ?? value
                  }
                />
                {visibleInvestments.map((inv) => (
                  <Bar key={inv.id} dataKey={inv.id} name={inv.id} stackId="renda" fill={colorById.get(inv.id)} />
                ))}
                <Bar dataKey="projecao" name="projecao" stackId="renda" fill={PROJECTION_COLOR} fillOpacity={0.6} />
                <Line
                  type="monotone"
                  dataKey="media12m"
                  name="media12m"
                  stroke="#f8fafc"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      {data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-100">Renda por ano</h3>
            <p className="mb-2 text-xs text-slate-400">
              Realizado no ano; no ano atual, a projeção de fechamento aparece em cinza.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearly} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatAxisCurrencyTick} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [
                      formatCurrencyBRL(value),
                      name === "projectedRemaining" ? "Projeção (restante do ano)" : "Realizado",
                    ]}
                  />
                  <Bar dataKey="realized" name="realized" stackId="ano" fill="#22d3ee" />
                  <Bar
                    dataKey="projectedRemaining"
                    name="projectedRemaining"
                    stackId="ano"
                    fill={PROJECTION_COLOR}
                    fillOpacity={0.6}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              {yearly.map((item) => (
                <div key={item.year} className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                  <span className="font-semibold text-slate-100">{item.year}</span>
                  <span>
                    {formatCurrencyBRL(item.realized)}
                    {item.isCurrent ? " realizado" : ""}
                    {item.isCurrent && item.projectedYear !== null ? (
                      <span className="text-slate-400"> · projeção {formatCurrencyBRL(item.projectedYear)}</span>
                    ) : null}
                    <span className={`ml-2 font-semibold ${toneClass(item.deltaPercent)}`}>
                      {item.deltaPercent === null
                        ? ""
                        : `${signedPercent(item.deltaPercent)} vs ano anterior${item.isCurrent ? " (projeção)" : ""}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-100">Composição da renda por ano</h3>
            <p className="mb-3 text-xs text-slate-400">Participação de cada investimento na renda de cada ano.</p>
            <div className="space-y-3">
              {composition.map((item) => (
                <div key={item.year} className="text-xs">
                  <div className="mb-1 flex justify-between text-slate-300">
                    <span className="font-semibold text-slate-100">{item.year}</span>
                    <span>{formatCurrencyBRL(item.total)}</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
                    {item.parts.map((part) => (
                      <div
                        key={part.id}
                        title={`${labelById.get(part.id)}: ${formatPercentage(part.share)}`}
                        style={{ width: `${part.share}%`, backgroundColor: colorById.get(part.id) }}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    {item.parts.map((part) => (
                      <span key={part.id} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorById.get(part.id) }}
                        />
                        {labelById.get(part.id)} {formatPercentage(part.share)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {data ? (
        <Card className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Comparação entre anos</h3>
            <p className="text-xs text-slate-400">
              Mesmos meses em dois anos. * mês em andamento: aparece no gráfico, mas fica fora dos totais.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {[
              { label: "Ano A", value: yearA, set: setYearA, options: availableYears.map((y) => [y, String(y)] as const) },
              { label: "Ano B", value: yearB, set: setYearB, options: availableYears.map((y) => [y, String(y)] as const) },
              {
                label: "Mês inicial",
                value: startMonth,
                set: setStartMonth,
                options: Array.from({ length: 12 }, (_, i) => [i + 1, monthLabel(i + 1)] as const),
              },
              {
                label: "Mês final",
                value: endMonth,
                set: setEndMonth,
                options: Array.from({ length: 12 }, (_, i) => [i + 1, monthLabel(i + 1)] as const),
              },
            ].map((control) => (
              <div key={control.label}>
                <label className="mb-1 block text-xs text-slate-400">{control.label}</label>
                <select
                  value={control.value}
                  onChange={(e) => control.set(Number(e.target.value))}
                  className={SELECT_CLASS}
                >
                  {control.options.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-700 bg-slate-900/40">
              <p className="text-xs text-slate-400">Total {yearA}</p>
              <p className="text-lg font-semibold text-cyan-300">{formatCurrencyBRL(comparison.totalA)}</p>
            </Card>
            <Card className="border-slate-700 bg-slate-900/40">
              <p className="text-xs text-slate-400">Total {yearB}</p>
              <p className="text-lg font-semibold text-slate-100">{formatCurrencyBRL(comparison.totalB)}</p>
            </Card>
            <Card className="border-slate-700 bg-slate-900/40">
              <p className="text-xs text-slate-400">Variação (R$)</p>
              <p className={`text-lg font-semibold ${toneClass(comparison.delta)}`}>{signedCurrency(comparison.delta)}</p>
            </Card>
            <Card className="border-slate-700 bg-slate-900/40">
              <p className="text-xs text-slate-400">Variação (%)</p>
              <p className={`text-lg font-semibold ${toneClass(comparison.deltaPercent)}`}>
                {signedPercent(comparison.deltaPercent)}
              </p>
            </Card>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison.rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatAxisCurrencyTick} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [
                    formatCurrencyBRL(value),
                    name === "valueA" ? String(yearA) : String(yearB),
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => (value === "valueA" ? String(yearA) : String(yearB))}
                />
                <Bar dataKey="valueA" name="valueA" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                <Bar dataKey="valueB" name="valueB" fill="#64748b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
