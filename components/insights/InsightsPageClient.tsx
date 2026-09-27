"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DailyInsightApiPayload,
  DashboardPayload,
  Investment,
  MarketSnapshotPayload,
  ProfessionalInsightsPayload,
} from "../../types";
import { countBusinessDaysInMonth, previousBusinessDay } from "../../lib/business-days";
import {
  formatCurrencyBRL,
  formatPercentage,
  formatPercentageDigits,
  monthLabel,
  monthNameFull,
} from "../../lib/formatters";
import { buildInsightChecks, rankAporteCandidates } from "../../lib/insights-actions";

interface Props {
  data: DashboardPayload;
  dailyInsights: DailyInsightApiPayload | null;
  marketSnapshot: MarketSnapshotPayload | null;
  professionalInsights: ProfessionalInsightsPayload | null;
  investments: Investment[];
  year: number;
}

function toIsoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function signedTone(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || Math.abs(value) < 0.005) return "text-slate-400";
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function buildForecastSeries(data: DashboardPayload) {
  const realized: Array<{
    label: string;
    realized: number | null;
    forecastBridge: number | null;
  }> = data.monthlySeries.map((m) => ({
    label: monthLabel(m.month),
    realized: m.total,
    forecastBridge: null,
  }));

  if (realized.length > 0) {
    const lastIndex = realized.length - 1;
    realized[lastIndex].forecastBridge = realized[lastIndex].realized;
  }

  const lastMonth = data.monthlySeries[data.monthlySeries.length - 1]?.month ?? 12;
  const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
  realized.push({
    label: `${monthLabel(nextMonth)}*`,
    realized: null,
    forecastBridge: data.insights.forecastNextMonth,
  });

  return realized;
}

function buildDistributionSeries(data: DashboardPayload) {
  return [
    ...data.distribution.cdbItems.map((item) => ({
      source: item.label,
      value: item.value,
    })),
    { source: "FIIs", value: data.distribution.fii },
  ];
}

type DriverInsight = {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
  sharePct: number;
};

type OperationalInsights = {
  currentMonth: number;
  currentTotal: number;
  expectedToDate: number;
  projectedClose: number;
  pacePercent: number | null;
  elapsedBusinessDays: number;
  totalBusinessDays: number;
  ytd: number;
  targetAnnual: number;
  remainingToTarget: number;
  monthsRemaining: number;
  requiredPerMonth: number;
  recentAverage: number;
  cdiReference: number;
  stressScenarios: Array<{ label: string; impact: number; simulatedTotal: number }>;
  drivers: DriverInsight[];
  priorityAction: string;
  asOfDate: string | null;
  hasActiveFii: boolean;
  goalLabel: string;
};

function marketRegimeLabel(
  regime: DashboardPayload["insights"]["fiiReinvestment"]["marketRegime"],
): string {
  if (regime === "JUROS_RESTRITIVOS") return "Juros restritivos";
  if (regime === "AFROUXAMENTO_MONETARIO") return "Afrouxamento monetário";
  if (regime === "INFLACAO_REACELERANDO") return "Inflação reacelerando";
  return "Regime equilibrado";
}

function radarStyle(status: "VERDE" | "AMARELO" | "VERMELHO") {
  if (status === "VERDE") return "bg-emerald-900/40 text-emerald-300 border-emerald-700/70";
  if (status === "AMARELO") return "bg-amber-900/40 text-amber-300 border-amber-700/70";
  return "bg-rose-900/40 text-rose-300 border-rose-700/70";
}

function formatTrendPp(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "estável";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")} p.p.`;
}

function formatPoints(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} pts`;
}

function normalizeTinyPercent(value: number): number {
  return Math.abs(value) < 0.005 ? 0 : value;
}

function signedDayVariation(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const normalized = normalizeTinyPercent(value);
  const signal = normalized > 0 ? "▲ " : normalized < 0 ? "▼ " : "• ";
  const signed =
    normalized > 0 ? `+${formatPercentageDigits(normalized, 2)}` : formatPercentageDigits(normalized, 2);
  return `${signal}${signed}`;
}

function dayVariationTone(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "text-slate-400";
  const normalized = normalizeTinyPercent(value);
  if (normalized > 0) return "text-emerald-300";
  if (normalized < 0) return "text-rose-300";
  return "text-slate-300";
}

function qualityGradeTone(grade: "A" | "B" | "C"): string {
  if (grade === "A") return "text-emerald-300";
  if (grade === "B") return "text-amber-300";
  return "text-rose-300";
}

function signedCurrency(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCurrencyBRL(Math.abs(value))}`;
}

function signedPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const signal = value > 0 ? "+" : "";
  return `${signal}${formatPercentage(value)}`;
}

function percentTwoDecimals(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return formatPercentageDigits(value, 2);
}

function riskRegimeTone(regime: "ESTAVEL" | "ATENCAO" | "ESTRESSADO"): string {
  if (regime === "ESTAVEL") return "text-emerald-300";
  if (regime === "ATENCAO") return "text-amber-300";
  return "text-rose-300";
}

function shortDate(value: string): string {
  // Datas "AAAA-MM-DD" são dias de calendário; new Date() as leria em UTC e voltaria um dia.
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoDay) return `${isoDay[3]}/${isoDay[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function deriveOperationalInsights(data: DashboardPayload, year: number): OperationalInsights {
  const series = [...data.monthlySeries].sort((a, b) => a.month - b.month);
  const pace = data.monthPace ?? null;
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const currentMonth =
    pace?.month ?? series[series.length - 1]?.month ?? (isCurrentYear ? now.getMonth() + 1 : 12);
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;

  const byMonth = new Map(series.map((entry) => [entry.month, entry]));
  const current = byMonth.get(currentMonth);
  const previous = byMonth.get(previousMonth);

  const currentCdbItems = current?.cdb_items ?? [];
  const previousCdbItems = previous?.cdb_items ?? [];
  const currentFii = current?.fii_dividends ?? 0;
  const previousFii = previous?.fii_dividends ?? 0;
  const hasActiveFii = pace ? pace.hasActiveFii : currentFii > 0;

  const currentTotal = current?.total ?? 0;
  // Média dos 3 últimos meses fechados (o mês em andamento fica fora).
  const closedMonths = pace?.closedMonths ?? [];
  const recentClosed = closedMonths.slice(-3);
  const recentAverage = recentClosed.length
    ? recentClosed.reduce((acc, entry) => acc + entry.total, 0) / recentClosed.length
    : 0;

  const totalBusinessDays = pace?.totalBusinessDays ?? Math.max(1, countBusinessDaysInMonth(year, currentMonth));
  const elapsedBusinessDays = pace?.elapsedBusinessDays ?? totalBusinessDays;
  // Referência: ritmo por dia útil do mês anterior até a data-base de cada investimento.
  const expectedToDate = pace?.expectedToDate ?? 0;
  const projectedClose = pace?.projected ?? currentTotal;
  const pacePercent = expectedToDate > 0 ? (currentTotal / expectedToDate) * 100 : null;

  const goal = data.goalProgress;
  const targetAnnual = goal.annualIncomeTarget;
  const ytd = data.kpis.ytdPassiveIncome;
  const remainingToTarget = goal.gapToTarget;
  const monthsRemaining =
    goal.source === "monthly_goals"
      ? Math.max(1, goal.remainingMonthsWithGoal ?? 0)
      : isCurrentYear
        ? Math.max(1, 12 - currentMonth)
        : 1;
  const requiredPerMonth = remainingToTarget / monthsRemaining;
  const goalLabel =
    goal.source === "monthly_goals"
      ? `soma das metas de ${goal.monthsWithGoal ?? 0} meses`
      : "meta configurada no ambiente";

  const driversBase: Array<{
    label: string;
    current: number;
    previous: number;
  }> = [
    ...currentCdbItems.map((cdb) => {
      const prevEntry = previousCdbItems.find((p) => p.investment_id === cdb.investment_id);
      return {
        label: cdb.label,
        current: cdb.income,
        previous: prevEntry?.income ?? 0,
      };
    }),
    ...(hasActiveFii || currentFii > 0 || previousFii > 0
      ? [{ label: "FIIs", current: currentFii, previous: previousFii }]
      : []),
  ];

  const drivers: DriverInsight[] = driversBase.map((driver) => {
    const delta = driver.current - driver.previous;
    const deltaPct =
      driver.previous > 0 ? (delta / driver.previous) * 100 : null;
    const sharePct = currentTotal > 0 ? (driver.current / currentTotal) * 100 : 0;
    return { ...driver, delta, deltaPct, sharePct };
  });

  const cdiReference =
    data.insights.cdiAnnualReference > 0 ? data.insights.cdiAnnualReference : 10.65;
  const cdbProjected = pace
    ? pace.investments.filter((item) => item.type === "CDB").reduce((acc, item) => acc + item.projected, 0)
    : currentCdbItems.reduce((acc, c) => acc + c.income, 0);
  const fiiProjected = pace
    ? pace.investments.filter((item) => item.type === "FII").reduce((acc, item) => acc + item.projected, 0)
    : currentFii;
  // Renda de CDB pós-fixado é proporcional ao CDI: 1 p.p. muda a renda em 1/CDI.
  const cdbImpactPer1pp = cdiReference > 0 ? cdbProjected / cdiReference : 0;

  const stressScenarios = [
    {
      label: `CDI −1 p.p. (${formatPercentageDigits(cdiReference, 2)} → ${formatPercentageDigits(cdiReference - 1, 2)})`,
      impact: -cdbImpactPer1pp,
      simulatedTotal: projectedClose - cdbImpactPer1pp,
    },
    {
      label: `CDI +1 p.p. (${formatPercentageDigits(cdiReference, 2)} → ${formatPercentageDigits(cdiReference + 1, 2)})`,
      impact: cdbImpactPer1pp,
      simulatedTotal: projectedClose + cdbImpactPer1pp,
    },
    ...(hasActiveFii
      ? [
          {
            label: "FIIs -10%",
            impact: -(fiiProjected * 0.1),
            simulatedTotal: projectedClose - fiiProjected * 0.1,
          },
          {
            label: "FIIs -20%",
            impact: -(fiiProjected * 0.2),
            simulatedTotal: projectedClose - fiiProjected * 0.2,
          },
        ]
      : []),
  ];

  // Queda relevante: renda projetada por dia útil abaixo do mês anterior.
  const previousById = new Map(previousCdbItems.map((item) => [item.investment_id, item.income]));
  const weakestInvestment = (pace?.investments ?? [])
    .map((item) => {
      const previousValue = previousById.get(item.investmentId) ?? 0;
      const previousPerDay = pace && previousValue > 0 ? previousValue / pace.previousMonthBusinessDays : null;
      const currentPerDay = pace ? item.projected / pace.totalBusinessDays : 0;
      return {
        label: item.label,
        deltaPct: previousPerDay ? ((currentPerDay - previousPerDay) / previousPerDay) * 100 : null,
      };
    })
    .filter((item): item is { label: string; deltaPct: number } => item.deltaPct !== null)
    .sort((a, b) => a.deltaPct - b.deltaPct)[0];

  let priorityAction = "Ritmo saudável. Manter estratégia atual e monitorar fechamento do mês.";
  if (weakestInvestment && weakestInvestment.deltaPct <= -5) {
    priorityAction = `Prioridade do mês: verificar ${weakestInvestment.label}, com renda projetada ${formatPercentage(
      weakestInvestment.deltaPct,
    )} por dia útil vs mês anterior (aporte, resgate ou taxa).`;
  } else if (!goal.onTrack && remainingToTarget > 0) {
    priorityAction = `Metas de renda do ano abaixo do ritmo: faltam ${formatCurrencyBRL(
      remainingToTarget,
    )} (${formatCurrencyBRL(requiredPerMonth)}/mês nos meses com meta restantes).`;
  } else if (goal.onTrack && targetAnnual > 0) {
    priorityAction = "Metas de renda do ano no ritmo. Priorize consistência e evitar concentração excessiva.";
  }

  return {
    currentMonth,
    currentTotal,
    expectedToDate,
    projectedClose,
    pacePercent,
    elapsedBusinessDays,
    totalBusinessDays,
    ytd,
    targetAnnual,
    remainingToTarget,
    monthsRemaining,
    requiredPerMonth,
    recentAverage,
    cdiReference,
    stressScenarios,
    drivers,
    priorityAction,
    asOfDate: pace?.asOfDate ?? null,
    hasActiveFii,
    goalLabel,
  };
}

export function InsightsPageClient({
  data,
  dailyInsights,
  marketSnapshot,
  professionalInsights,
  investments,
  year,
}: Props) {
  const forecastSeries = buildForecastSeries(data);
  const distributionSeries = buildDistributionSeries(data);
  const operational = deriveOperationalInsights(data, year);
  const fiiSuggestion = data.insights.fiiReinvestment;
  const dailyReport = dailyInsights?.report ?? null;
  const pace = data.monthPace ?? null;
  const diagnosisHistorySeries = (professionalInsights?.diagnosisHistory ?? [])
    .slice()
    .reverse()
    .map((item) => ({
      date: shortDate(item.runDate),
      hitRate: item.hitRatePercent ?? 0,
      edge: item.cumulativeEdgeValue,
      risk: item.riskScore,
      headline: item.headline,
      regime: item.riskRegime,
    }));

  // ── O que fazer agora ──
  const benchmarkItems = professionalInsights?.benchmark.items ?? [];
  const realizedById = new Map(benchmarkItems.map((item) => [item.key, item.percentOfCdi]));
  const activeCdbs = investments.filter((inv) => inv.type === "CDB" && Number(inv.amount_invested) > 0);
  const ranked = rankAporteCandidates(
    activeCdbs.map((inv) => ({
      id: inv.id,
      label: inv.name || `CDB ${inv.institution}`,
      institution: inv.institution,
      balance: Number(inv.amount_invested),
      contractedCdiPercent: Number(inv.cdi_rate) > 0 ? Number(inv.cdi_rate) : null,
      realizedPercentOfCdi: realizedById.get(inv.id) ?? null,
      liquidity: inv.liquidity ?? null,
    })),
  );
  const bestAporte = ranked.find((item) => item.eligible) ?? null;
  const alternatives = ranked.filter((item) => item !== bestAporte).slice(0, 3);
  const checks = buildInsightChecks({
    benchmark: benchmarkItems,
    pace: (pace?.investments ?? []).map((item) => ({
      investmentId: item.investmentId,
      label: item.label,
      realized: item.realized,
      asOfDate: item.asOfDate,
    })),
    dataBaseIso: pace?.isCurrentMonth ? toIsoDay(previousBusinessDay(new Date())) : null,
    institutions: activeCdbs.map((inv) => ({ institution: inv.institution, balance: Number(inv.amount_invested) })),
  });
  const extraRisks = [
    ...(dailyReport?.risks ?? [])
      .filter((risk) => risk.level !== "low")
      .map((risk) => ({ id: `risk-${risk.id}`, severity: risk.level === "high" ? "high" : "medium", title: risk.title, detail: risk.description })),
    ...(professionalInsights?.diagnosticAlerts ?? [])
      .filter((alert) => alert.severity !== "low")
      .map((alert) => ({ id: `alert-${alert.id}`, severity: alert.severity, title: alert.title, detail: alert.message })),
  ] as Array<{ id: string; severity: "high" | "medium"; title: string; detail: string }>;
  const seenTitles = new Set<string>();
  const allChecks = [...checks, ...extraRisks].filter((check) => {
    const key = check.title.toLowerCase();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  // ── Metas ──
  const monthlyGoal = professionalInsights?.goalProbabilities.monthlyIncome ?? null;
  const capitalGoal = professionalInsights?.goalProbabilities.annualCapital ?? null;
  const goal = data.goalProgress;
  const monthlyGap = monthlyGoal?.targetValue ? Math.max(0, monthlyGoal.targetValue - monthlyGoal.realizedValue) : null;
  const neededPerDay =
    monthlyGap !== null && pace && pace.isCurrentMonth && pace.remainingBusinessDays > 0
      ? monthlyGap / pace.remainingBusinessDays
      : null;

  // ── O que mudou no mês ──
  const attribution = professionalInsights?.attribution ?? null;
  const attributionMonth = professionalInsights ? { year: professionalInsights.year, month: professionalInsights.month } : null;
  const currentDays = attributionMonth ? countBusinessDaysInMonth(attributionMonth.year, attributionMonth.month) : 0;
  const previousRef = attributionMonth
    ? attributionMonth.month === 1
      ? { year: attributionMonth.year - 1, month: 12 }
      : { year: attributionMonth.year, month: attributionMonth.month - 1 }
    : null;
  const previousDays = previousRef ? countBusinessDaysInMonth(previousRef.year, previousRef.month) : 0;
  const maxAbsDelta = Math.max(1, ...(attribution?.items ?? []).map((item) => Math.abs(item.deltaValue)));
  const perDayChange = (current: number, previous: number): number | null =>
    previous > 0 && currentDays > 0 && previousDays > 0
      ? ((current / currentDays) / (previous / previousDays) - 1) * 100
      : null;
  const monthName = pace ? monthNameFull(pace.month) : "";
  const describeLiquidity = (item: { liquidity: string | null; liquidityLabel: string }) =>
    item.liquidity ? ` · ${item.liquidityLabel}` : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-50">Insights</h2>
          <p className="text-sm text-slate-400">Leitura do mês, próximos passos e metas ({year}).</p>
        </div>
        {marketSnapshot ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-slate-300">
              Selic <strong className="text-slate-100">{formatPercentageDigits(marketSnapshot.selicPercent, 2)}</strong>
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-slate-300">
              CDI <strong className="text-slate-100">{formatPercentageDigits(marketSnapshot.cdiAnnualizedPercent, 2)}</strong> a.a.
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-slate-300">
              Ibovespa <strong className="text-slate-100">{formatPoints(marketSnapshot.ibovespaPreviousClose)}</strong>{" "}
              <span className={dayVariationTone(marketSnapshot.ibovespaDayChangePercent)}>
                {signedDayVariation(marketSnapshot.ibovespaDayChangePercent)}
              </span>
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-slate-300">
              IFIX <strong className="text-slate-100">{formatPoints(marketSnapshot.ifixPreviousClose)}</strong>{" "}
              <span className={dayVariationTone(marketSnapshot.ifixDayChangePercent)}>
                {signedDayVariation(marketSnapshot.ifixDayChangePercent)}
              </span>
            </span>
          </div>
        ) : null}
      </header>

      {/* 1. Resumo do mês */}
      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100">Resumo de {monthName}</h3>
          {dailyReport ? (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${radarStyle(dailyReport.radarStatus)}`}>
              {dailyReport.radarStatus === "VERDE" ? "No ritmo" : dailyReport.radarStatus === "AMARELO" ? "Atenção" : "Alerta"}
            </span>
          ) : null}
          {pace?.isCurrentMonth && pace.asOfDate ? (
            <span className="text-[11px] text-slate-500">
              dados até {shortDate(pace.asOfDate)} · {pace.elapsedBusinessDays}/{pace.totalBusinessDays} dias úteis
            </span>
          ) : null}
        </div>
        {dailyReport ? <p className="mt-2 text-base font-semibold text-slate-50">{dailyReport.headline}</p> : null}
        {pace ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Realizado no mês</p>
              <p className="text-xl font-bold text-slate-50">{formatCurrencyBRL(pace.realized)}</p>
              <p className="text-[11px] text-slate-500">
                ritmo {pace.expectedToDate ? formatPercentage((pace.realized / pace.expectedToDate) * 100) : "—"} do mês anterior
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                {pace.isCurrentMonth ? "Fechamento projetado" : "Fechamento"}
              </p>
              <p className="text-xl font-bold text-cyan-300">{formatCurrencyBRL(pace.projected)}</p>
              <p className={`text-[11px] ${signedTone(pace.projectedVsPreviousPercent)}`}>
                {signedPercentage(pace.projectedVsPreviousPercent)} vs mês anterior
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Rentabilidade vs CDI</p>
              <p
                className={`text-xl font-bold ${
                  (professionalInsights?.benchmark.portfolioPercentOfCdi ?? 100) >= 100 ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {formatPercentage(professionalInsights?.benchmark.portfolioPercentOfCdi ?? null)} do CDI
              </p>
              <p className="text-[11px] text-slate-500">
                carteira {percentTwoDecimals(professionalInsights?.benchmark.portfolioMomPercent)} · CDI{" "}
                {percentTwoDecimals(professionalInsights?.benchmark.cdiMomPercent)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Projeção do ano</p>
              <p className="text-xl font-bold text-slate-50">{formatCurrencyBRL(pace.annualProjection)}</p>
              <p className={`text-[11px] ${signedTone(pace.yoyPercent)}`}>
                mês {signedPercentage(pace.yoyPercent)} vs mesmo mês do ano anterior
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. O que fazer agora */}
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-indigo-500/40 bg-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-100">Próximo aporte</h3>
          {bestAporte ? (
            <>
              <p className="mt-2 text-base font-semibold text-slate-50">Priorizar {bestAporte.label}</p>
              <p className="mt-1 text-xs text-slate-400">
                {bestAporte.rate !== null ? `${Math.round(bestAporte.rate)}% do CDI ${bestAporte.rateSource}` : "sem taxa"}
                {describeLiquidity(bestAporte)} · folga no FGC de {formatCurrencyBRL(bestAporte.fgcHeadroom)}
              </p>
              {alternatives.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  {alternatives.map((item) => (
                    <li key={item.id}>
                      <span className="text-slate-200">{item.label}</span>:{" "}
                      {item.rate !== null ? `${Math.round(item.rate)}% do CDI ${item.rateSource}` : "sem taxa"}
                      {describeLiquidity(item)}
                      {item.notes.length > 0 ? <span className="text-amber-300"> · {item.notes.join(", ")}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              Nenhum CDB da carteira com taxa conhecida e folga no FGC. Compare ofertas novas.
            </p>
          )}
          <a href="/compare" className="mt-3 inline-block text-xs font-semibold text-indigo-300 hover:text-indigo-200">
            Comparar com ofertas do mercado em Onde Aportar →
          </a>
        </article>

        <article className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-100">O que conferir</h3>
          {allChecks.length === 0 ? (
            <p className="mt-2 text-xs text-emerald-300">Nada a conferir: taxas, lançamentos e limites do FGC em ordem.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {allChecks.map((check) => (
                <li
                  key={check.id}
                  className={`rounded-md border px-3 py-2 text-xs ${
                    check.severity === "high"
                      ? "border-rose-700/60 bg-rose-950/30 text-rose-100"
                      : "border-amber-700/60 bg-amber-950/20 text-amber-100"
                  }`}
                >
                  <p className="font-semibold">{check.title}</p>
                  <p className="mt-0.5 opacity-90">{check.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      {/* 3. Metas */}
      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h3 className="text-sm font-semibold text-slate-100">Metas</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {monthlyGoal && monthlyGoal.targetValue ? (
            <GoalCard
              title={`Renda de ${monthName} (CDBs)`}
              realized={monthlyGoal.realizedValue}
              projected={monthlyGoal.projectedValue}
              target={monthlyGoal.targetValue}
              probability={monthlyGoal.probabilityPercent}
              footer={
                monthlyGap !== null && monthlyGap > 0 && neededPerDay !== null
                  ? `Faltam ${formatCurrencyBRL(monthlyGap)}: ${formatCurrencyBRL(neededPerDay)} por dia útil (ritmo atual ${formatCurrencyBRL(
                      pace?.dailyRate ?? 0,
                    )}).`
                  : monthlyGap === 0
                    ? "Meta do mês atingida."
                    : null
              }
            />
          ) : null}
          {goal.annualIncomeTarget > 0 ? (
            <GoalCard
              title={`Renda do ano (${operational.goalLabel})`}
              realized={null}
              projected={goal.annualProjection}
              target={goal.annualIncomeTarget}
              probability={null}
              footer={
                goal.gapToTarget > 0
                  ? `Faltam ${formatCurrencyBRL(goal.gapToTarget)}: ${formatCurrencyBRL(operational.requiredPerMonth)}/mês nos meses com meta.`
                  : `No ritmo: projeção ${formatPercentage(goal.progressPercent)} da meta.`
              }
            />
          ) : null}
          {capitalGoal && capitalGoal.targetValue ? (
            <GoalCard
              title="Patrimônio no fim do ano"
              realized={capitalGoal.realizedValue}
              projected={capitalGoal.projectedValue}
              target={capitalGoal.targetValue}
              probability={capitalGoal.probabilityPercent}
              footer={
                capitalGoal.targetValue > capitalGoal.projectedValue
                  ? `Projeção fica ${formatCurrencyBRL(capitalGoal.targetValue - capitalGoal.projectedValue)} abaixo. Veja o aporte necessário em Metas.`
                  : "Projeção alcança a meta."
              }
              realizedLabel="Atual"
            />
          ) : null}
        </div>
      </section>

      {/* 4. Rentabilidade vs CDI por investimento */}
      {professionalInsights ? (
        <section className="grid gap-4">
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4 xl:col-span-2">
              <h4 className="text-sm font-semibold text-slate-100">
                Rentabilidade vs CDI por investimento ({professionalInsights.benchmark.referenceMonthLabel})
              </h4>
              <p className="mt-1 text-[11px] text-slate-400">
                Rendimento do mês sobre o capital aplicado versus o CDI acumulado nos dias úteis do mês.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-xs">
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Carteira no mês:{" "}
                  <span className="font-semibold text-cyan-300">
                    {percentTwoDecimals(professionalInsights.benchmark.portfolioMomPercent)}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  CDI no mês:{" "}
                  <span className="font-semibold text-slate-100">
                    {percentTwoDecimals(professionalInsights.benchmark.cdiMomPercent)}
                  </span>
                </p>
                <p
                  className={`rounded-md border border-slate-700 px-2 py-1 ${
                    (professionalInsights.benchmark.portfolioPercentOfCdi ?? 100) >= 100
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  % do CDI:{" "}
                  <span className="font-semibold">
                    {professionalInsights.benchmark.portfolioPercentOfCdi === null ||
                    professionalInsights.benchmark.portfolioPercentOfCdi === undefined
                      ? "—"
                      : formatPercentage(professionalInsights.benchmark.portfolioPercentOfCdi)}
                  </span>
                </p>
                <p
                  className={`rounded-md border border-slate-700 px-2 py-1 ${
                    (professionalInsights.benchmark.excessVsCdiPercent ?? 0) >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  Excesso vs CDI:{" "}
                  <span className="font-semibold">
                    {professionalInsights.benchmark.excessVsCdiPercent === null
                      ? "—"
                      : `${professionalInsights.benchmark.excessVsCdiPercent >= 0 ? "+" : ""}${professionalInsights.benchmark.excessVsCdiPercent.toFixed(2).replace(".", ",")} p.p.`}
                  </span>
                </p>
              </div>
              {(professionalInsights.benchmark.items ?? []).length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="py-2">Investimento</th>
                        <th className="py-2">Rendimento no mês</th>
                        <th className="py-2">% do CDI realizado</th>
                        <th className="py-2">% do CDI contratado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(professionalInsights.benchmark.items ?? []).map((item) => (
                        <tr key={item.key} className="border-t border-slate-700/70 text-slate-200">
                          <td className="py-2">{item.label}</td>
                          <td className="py-2 text-cyan-300">{percentTwoDecimals(item.monthlyYieldPercent)}</td>
                          <td
                            className={`py-2 font-semibold ${
                              item.percentOfCdi === null
                                ? "text-slate-400"
                                : item.contractedCdiPercent !== null && item.percentOfCdi < item.contractedCdiPercent
                                  ? "text-rose-300"
                                  : "text-emerald-300"
                            }`}
                          >
                            {item.percentOfCdi === null ? "—" : formatPercentage(item.percentOfCdi)}
                          </td>
                          <td className="py-2 text-slate-400">
                            {item.contractedCdiPercent === null ? "—" : formatPercentage(item.contractedCdiPercent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="mt-3 text-[11px] text-slate-500">
                Contexto de mercado (variação de preço, não comparável com renda fixa): IFIX{" "}
                {signedPercentage(professionalInsights.benchmark.ifixMomPercent)} · Ibov{" "}
                {signedPercentage(professionalInsights.benchmark.ibovMomPercent)}
              </p>
              {professionalInsights.benchmark.warnings.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-amber-300">
                  {professionalInsights.benchmark.warnings.map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>• {warning}</li>
                  ))}
                </ul>
              ) : null}
            </article>
        </section>
      ) : null}

      {/* 5. O que mudou no mês */}
      {attribution && attribution.items.length > 0 ? (
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-100">O que mudou no mês</h3>
          <p className="mt-1 text-[11px] text-slate-400">
            {attribution.monthLabel}
            {" "}vs {attribution.previousMonthLabel ?? "mês anterior"}.
            &quot;Por dia útil&quot; desconta a diferença de dias úteis entre os meses.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs md:text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2">Investimento</th>
                  <th className="py-2 text-right">{attribution.monthLabel}</th>
                  <th className="py-2 text-right">{attribution.previousMonthLabel ?? "Anterior"}</th>
                  <th className="py-2 text-right">Δ R$</th>
                  <th className="py-2 text-right">Por dia útil</th>
                  <th className="w-40 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {attribution.items.map((item) => {
                  const perDay = perDayChange(item.currentValue, item.previousValue);
                  return (
                    <tr key={item.key}>
                      <td className="py-2 text-slate-200">{item.label}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-100">
                        {formatCurrencyBRL(item.currentValue)}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-400">
                        {formatCurrencyBRL(item.previousValue)}
                      </td>
                      <td className={`whitespace-nowrap py-2 text-right tabular-nums font-semibold ${signedTone(item.deltaValue)}`}>
                        {signedCurrency(item.deltaValue)}
                      </td>
                      <td className={`whitespace-nowrap py-2 text-right tabular-nums ${signedTone(perDay)}`}>
                        {signedPercentage(perDay)}
                      </td>
                      <td className="py-2 pl-3">
                        <div className="flex h-2 w-full">
                          <div className="flex w-1/2 justify-end">
                            {item.deltaValue < 0 ? (
                              <div
                                className="h-2 rounded-l bg-rose-400"
                                style={{ width: `${(Math.abs(item.deltaValue) / maxAbsDelta) * 100}%` }}
                              />
                            ) : null}
                          </div>
                          <div className="w-1/2">
                            {item.deltaValue > 0 ? (
                              <div
                                className="h-2 rounded-r bg-emerald-400"
                                style={{ width: `${(item.deltaValue / maxAbsDelta) * 100}%` }}
                              />
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600 font-semibold">
                  <td className="py-2 text-slate-300">Total</td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-50">
                    {formatCurrencyBRL(attribution.totalCurrent)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-400">
                    {formatCurrencyBRL(attribution.totalPrevious)}
                  </td>
                  <td className={`whitespace-nowrap py-2 text-right tabular-nums ${signedTone(attribution.totalDelta)}`}>
                    {signedCurrency(attribution.totalDelta)}
                  </td>
                  <td
                    className={`whitespace-nowrap py-2 text-right tabular-nums ${signedTone(
                      perDayChange(attribution.totalCurrent, attribution.totalPrevious),
                    )}`}
                  >
                    {signedPercentage(perDayChange(attribution.totalCurrent, attribution.totalPrevious))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {/* 6. Detalhes técnicos */}
      <details className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-200">
          Detalhes técnicos
          <span className="ml-2 text-xs font-normal text-slate-500">
            risco, stress test, qualidade da previsão e dos dados, motor de recomendação e backtest
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          {professionalInsights ? (
            <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Radar de risco (renda passiva)</h4>
              <div className="mt-3 space-y-2 text-xs">
                <p>
                  Regime:{" "}
                  <span className={`font-semibold ${riskRegimeTone(professionalInsights.riskRadar.regime)}`}>
                    {professionalInsights.riskRadar.regime}
                  </span>
                </p>
                <p>
                  Score risco:{" "}
                  <span className="font-semibold text-cyan-300">
                    {professionalInsights.riskRadar.score.toFixed(1).replace(".", ",")}/100
                  </span>
                </p>
                <p>
                  Volatilidade 3M:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatPercentage(professionalInsights.riskRadar.volatility3mPercent)}
                  </span>
                </p>
                <p>
                  Volatilidade 6M:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatPercentage(professionalInsights.riskRadar.volatility6mPercent)}
                  </span>
                </p>
                <p>
                  Drawdown máx:{" "}
                  <span className="font-semibold text-rose-300">
                    {formatPercentage(professionalInsights.riskRadar.maxDrawdownPercent)}
                  </span>
                </p>
                <p>
                  Tendência/mês:{" "}
                  <span
                    className={`font-semibold ${
                      professionalInsights.riskRadar.trendPerMonthPercent >= 0
                        ? "text-emerald-300"
                        : "text-rose-300"
                    }`}
                  >
                    {signedPercentage(professionalInsights.riskRadar.trendPerMonthPercent)}
                  </span>
                </p>
              </div>
            </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Stress test rápido</h3>
          <p className="mt-1 text-[11px] text-slate-400">
            Base CDI: {formatPercentageDigits(operational.cdiReference, 2)} a.a. · sobre a projeção do mês
          </p>
          <ul className="mt-3 space-y-2 text-xs">
            {operational.stressScenarios.map((scenario) => (
              <li key={scenario.label} className="rounded-md border border-slate-700 p-2">
                <p className="text-slate-300">{scenario.label}</p>
                <p
                  className={`font-semibold ${
                    scenario.impact >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  Impacto: {scenario.impact >= 0 ? "+" : ""}
                  {formatCurrencyBRL(scenario.impact)}
                </p>
                <p className="text-slate-400">
                  Total simulado: {formatCurrencyBRL(scenario.simulatedTotal)}
                </p>
              </li>
            ))}
          </ul>
        </article>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Stress test rápido</h3>
          <p className="mt-1 text-[11px] text-slate-400">
            Base CDI: {formatPercentageDigits(operational.cdiReference, 2)} a.a. · sobre a projeção do mês
          </p>
          <ul className="mt-3 space-y-2 text-xs">
            {operational.stressScenarios.map((scenario) => (
              <li key={scenario.label} className="rounded-md border border-slate-700 p-2">
                <p className="text-slate-300">{scenario.label}</p>
                <p
                  className={`font-semibold ${
                    scenario.impact >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  Impacto: {scenario.impact >= 0 ? "+" : ""}
                  {formatCurrencyBRL(scenario.impact)}
                </p>
                <p className="text-slate-400">
                  Total simulado: {formatCurrencyBRL(scenario.simulatedTotal)}
                </p>
              </li>
            ))}
          </ul>
        </article>
            </div>
          )}
          {professionalInsights ? (
            <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Qualidade da previsão</h4>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2">Série</th>
                      <th className="py-2">MAPE</th>
                      <th className="py-2">MAE</th>
                      <th className="py-2">Viés</th>
                      <th className="py-2">Direção</th>
                      <th className="py-2">Amostra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {professionalInsights.forecastQuality.metrics.map((metric) => (
                      <tr key={metric.key} className="border-t border-slate-700/70 text-slate-200">
                        <td className="py-2">{metric.label}</td>
                        <td className="py-2 text-cyan-300">
                          {metric.mapePercent === null ? "—" : formatPercentage(metric.mapePercent)}
                        </td>
                        <td className="py-2">{metric.maeValue === null ? "—" : formatCurrencyBRL(metric.maeValue)}</td>
                        <td
                          className={`py-2 font-semibold ${
                            metric.biasValue === null
                              ? "text-slate-400"
                              : metric.biasValue > 0
                                ? "text-emerald-300"
                                : metric.biasValue < 0
                                  ? "text-rose-300"
                                  : "text-slate-300"
                          }`}
                        >
                          {metric.biasValue === null ? "—" : signedCurrency(metric.biasValue)}
                        </td>
                        <td className="py-2 text-amber-300">
                          {metric.directionAccuracyPercent === null
                            ? "—"
                            : formatPercentage(metric.directionAccuracyPercent)}
                        </td>
                        <td className="py-2 text-slate-400">{metric.sampleSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Qualidade dos dados</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Nota:{" "}
                  <span className={`font-semibold ${qualityGradeTone(professionalInsights.dataQuality.grade)}`}>
                    {professionalInsights.dataQuality.grade}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Cobertura:{" "}
                  <span className="font-semibold text-cyan-300">
                    {formatPercentage(professionalInsights.dataQuality.completenessPercent)}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Meses com dado:{" "}
                  <span className="font-semibold text-slate-100">
                    {professionalInsights.dataQuality.monthsWithData}/
                    {professionalInsights.dataQuality.expectedMonths}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Último lançamento:{" "}
                  <span className="font-semibold text-slate-100">
                    {professionalInsights.dataQuality.latestEntryAt
                      ? new Date(professionalInsights.dataQuality.latestEntryAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Outliers:{" "}
                  <span className="font-semibold text-amber-300">
                    {professionalInsights.dataQuality.outlierCount}
                  </span>
                </p>
                <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                  Duplicidades:{" "}
                  <span className="font-semibold text-rose-300">
                    {professionalInsights.dataQuality.duplicateRows}
                  </span>
                </p>
              </div>
              {professionalInsights.dataQuality.warnings.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-amber-300">
                  {professionalInsights.dataQuality.warnings.map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>• {warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-emerald-300">Sem alertas de qualidade no período.</p>
              )}
            </article>
            </div>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Realizado vs previsão (mês seguinte)
          </h3>
          <p className="mb-4 text-xs text-slate-400">
            * último ponto representa a previsão do próximo mês.
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastSeries} margin={{ top: 8, right: 18, left: 22, bottom: 8 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis
                  stroke="#94a3b8"
                  tickFormatter={(value) => formatCurrencyBRL(Number(value))}
                  width={100}
                />
                <Tooltip
                  labelFormatter={(label) => `Mês: ${label}`}
                  formatter={(value: number | string) =>
                    formatCurrencyBRL(Number(value))
                  }
                  contentStyle={{
                    backgroundColor: "#020617",
                    borderColor: "#1f2937",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                  itemStyle={{ color: "#a5b4fc", fontWeight: 600 }}
                />
                <Legend />
                <Line
                  type="linear"
                  dataKey="realized"
                  name="Realizado"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  type="linear"
                  dataKey="forecastBridge"
                  name="Previsto (ponte)"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-100">
            Composição da renda no ano
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionSeries}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="source" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={formatCurrencyBRL} />
                <Tooltip
                  formatter={(value: number | string) =>
                    formatCurrencyBRL(Number(value))
                  }
                  contentStyle={{
                    backgroundColor: "#020617",
                    borderColor: "#1f2937",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                  itemStyle={{ color: "#818cf8", fontWeight: 600 }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
          </div>
          {professionalInsights ? (
            <>
          <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h4 className="text-sm font-semibold text-slate-100">Motor de recomendação de aporte</h4>
            <p className="mt-1 text-xs text-cyan-300">{professionalInsights.recommendation.action}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
              <p className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">
                Janela avaliada:{" "}
                <span className="font-semibold text-slate-100">
                  {professionalInsights.recommendation.backtest.sampleSize} meses
                </span>
              </p>
              <p
                className={`rounded-md border border-slate-700 px-2 py-1 ${
                  (professionalInsights.recommendation.backtest.hitRatePercent ?? 0) >= 50
                    ? "text-emerald-300"
                    : "text-amber-300"
                }`}
              >
                Taxa de acerto:{" "}
                <span className="font-semibold">
                  {professionalInsights.recommendation.backtest.hitRatePercent === null
                    ? "—"
                    : formatPercentage(professionalInsights.recommendation.backtest.hitRatePercent)}
                </span>
              </p>
              <p
                className={`rounded-md border border-slate-700 px-2 py-1 ${
                  professionalInsights.recommendation.backtest.cumulativeEdgeValue >= 0
                    ? "text-emerald-300"
                    : "text-rose-300"
                }`}
              >
                Edge acumulado:{" "}
                <span className="font-semibold">
                  {signedCurrency(professionalInsights.recommendation.backtest.cumulativeEdgeValue)}
                </span>
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-2">Ativo</th>
                    <th className="py-2">Score</th>
                    <th className="py-2">Momentum</th>
                    <th className="py-2">Yield mensal</th>
                    <th className="py-2">Estabilidade</th>
                    <th className="py-2">Racional</th>
                  </tr>
                </thead>
                <tbody>
                  {professionalInsights.recommendation.items.map((item) => (
                    <tr key={item.key} className="border-t border-slate-700/70 text-slate-200">
                      <td className="py-2">
                        {item.label}
                        {item.key === professionalInsights.recommendation.bestAssetKey ? (
                          <span className="ml-2 rounded-full border border-emerald-600/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            Top
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 font-semibold text-cyan-300">{item.score.toFixed(1).replace(".", ",")}</td>
                      <td className="py-2">{signedPercentage(item.momentumPercent)}</td>
                      <td className="py-2">
                        {item.monthlyYieldPercent === null
                          ? "—"
                          : formatPercentage(item.monthlyYieldPercent)}
                      </td>
                      <td className="py-2 text-amber-300">{formatPercentage(item.stabilityPercent)}</td>
                      <td className="py-2 text-slate-400">{item.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {professionalInsights.recommendation.backtest.evaluations.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-xs font-semibold text-slate-300">
                  Backtest do motor (sinal M-1 → resultado em M)
                </p>
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2">Sinal</th>
                      <th className="py-2">Mês resultado</th>
                      <th className="py-2">Escolha</th>
                      <th className="py-2">Melhor real</th>
                      <th className="py-2">Acerto</th>
                      <th className="py-2">Edge R$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {professionalInsights.recommendation.backtest.evaluations
                      .slice(0, 6)
                      .map((row) => (
                        <tr
                          key={`${row.fromMonthLabel}-${row.toMonthLabel}-${row.predictedKey}`}
                          className="border-t border-slate-700/70 text-slate-200"
                        >
                          <td className="py-2">{row.fromMonthLabel}</td>
                          <td className="py-2">{row.toMonthLabel}</td>
                          <td className="py-2">{row.predictedLabel}</td>
                          <td className="py-2">{row.actualBestLabel}</td>
                          <td className={`py-2 font-semibold ${row.hit ? "text-emerald-300" : "text-rose-300"}`}>
                            {row.hit ? "Sim" : "Não"}
                          </td>
                          <td className={`py-2 font-semibold ${row.edgeValue >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {signedCurrency(row.edgeValue)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/40 p-3 text-xs">
              <p className="font-semibold text-slate-100">
                Leitura analítica do backtest: {professionalInsights.recommendation.backtest.diagnosis.headline}
              </p>
              <div className="mt-2 grid gap-2 xl:grid-cols-2">
                <div>
                  <p className="font-semibold text-emerald-300">Forças</p>
                  <ul className="mt-1 space-y-1 text-slate-300">
                    {professionalInsights.recommendation.backtest.diagnosis.strengths.map((item, idx) => (
                      <li key={`strength-${idx}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-rose-300">Falhas recorrentes</p>
                  <ul className="mt-1 space-y-1 text-slate-300">
                    {professionalInsights.recommendation.backtest.diagnosis.weaknesses.map((item, idx) => (
                      <li key={`weak-${idx}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-2 text-cyan-300">
                Próximo ajuste recomendado:{" "}
                <span className="font-semibold">
                  {professionalInsights.recommendation.backtest.diagnosis.nextAdjustment}
                </span>
              </p>
            </div>
          </article>
          <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h4 className="text-sm font-semibold text-slate-100">
              Evolução diária do diagnóstico (mês atual)
            </h4>
            <div className="mt-2 rounded-md border border-slate-700/70 bg-slate-900/40 p-3 text-[11px] text-slate-300">
              <p className="font-semibold text-slate-100">Como ler este painel</p>
              <div className="mt-2 grid gap-2 xl:grid-cols-2">
                <p>
                  <span className="font-semibold text-cyan-300">Hit rate (%):</span> taxa de acerto
                  dos diagnósticos recentes. Quanto maior, melhor.
                </p>
                <p>
                  <span className="font-semibold text-amber-300">Edge acumulado (R$):</span> renda
                  mensal extra, somada nos meses do backtest, de um aporte seguindo a recomendação em vez
                  da média da carteira. Positivo = gerou valor.
                </p>
                <p>
                  <span className="font-semibold text-rose-300">Risk score (0-100):</span> nível de
                  estresse da carteira. 0-39 controlado, 40-69 atenção, 70-100 estressado.
                </p>
                <p>
                  <span className="font-semibold text-slate-200">Headline:</span> frase-resumo do dia
                  para orientar ação rápida.
                </p>
              </div>
            </div>
            {diagnosisHistorySeries.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">
                Sem histórico diário disponível para este mês.
              </p>
            ) : (
              <>
                <p className="mt-3 text-[11px] text-slate-400">
                  Eixo esquerdo: Hit rate (%). Eixo direito: Risk score (0-100). O Edge acumulado (R$)
                  aparece no tooltip e na tabela abaixo.
                </p>
                <div className="mt-3 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={diagnosisHistorySeries}
                      margin={{ top: 8, right: 18, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="#94a3b8" />
                      <YAxis
                        yAxisId="left"
                        stroke="#94a3b8"
                        width={64}
                        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#94a3b8"
                        width={56}
                        tickFormatter={(value) => `${Number(value).toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "#1f2937",
                          borderRadius: 8,
                        }}
                        labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                        formatter={(value: number | string, key: string) => {
                          const numeric = Number(value ?? 0);
                          if (key === "hitRate") return [formatPercentage(numeric), "Taxa de acerto (%)"];
                          if (key === "risk") return [numeric.toFixed(1), "Risk score (0-100)"];
                          return [signedCurrency(numeric), "Edge acumulado (R$)"];
                        }}
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="hitRate"
                        name="Hit rate (%)"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="edge"
                        name="Edge acumulado (R$)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="risk"
                        name="Risk score (0-100)"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="py-2">Data</th>
                        <th className="py-2">Hit rate (%)</th>
                        <th className="py-2">Edge (R$)</th>
                        <th className="py-2">Risco (0-100)</th>
                        <th className="py-2">Headline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {professionalInsights.diagnosisHistory.slice(0, 7).map((item) => (
                        <tr
                          key={`${item.runDate}-${item.month}-${item.year}`}
                          className="border-t border-slate-700/70 text-slate-200"
                        >
                          <td className="py-2">{shortDate(item.runDate)}</td>
                          <td className="py-2 text-cyan-300">
                            {item.hitRatePercent === null ? "—" : formatPercentage(item.hitRatePercent)}
                          </td>
                          <td
                            className={`py-2 font-semibold ${
                              item.cumulativeEdgeValue >= 0 ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {signedCurrency(item.cumulativeEdgeValue)}
                          </td>
                          <td className={`py-2 ${riskRegimeTone(item.riskRegime)}`}>
                            {item.riskScore.toFixed(1).replace(".", ",")} ({item.riskRegime})
                          </td>
                          <td className="py-2 text-slate-400">{item.headline}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </article>
            </>
          ) : null}
          {operational.hasActiveFii ? (
            <div className="grid gap-4">
        {operational.hasActiveFii ? (
          <article className="rounded-xl border border-cyan-800 bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-100">
              Reinvestimento FIIs (Tijolo x Papel)
            </h3>
            <p className="mt-1 text-[11px] text-slate-400">
              Tendência de mercado real (BCB) para o próximo ciclo mensal.
            </p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-orange-300">Tijolo</span>
                <span className="font-semibold text-orange-300">
                  {formatPercentage(fiiSuggestion.tijoloPercent)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-700">
                <div
                  className="h-2 rounded-full bg-orange-400"
                  style={{ width: `${fiiSuggestion.tijoloPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-emerald-300">Papel</span>
                <span className="font-semibold text-emerald-300">
                  {formatPercentage(fiiSuggestion.papelPercent)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-700">
                <div
                  className="h-2 rounded-full bg-emerald-400"
                  style={{ width: `${fiiSuggestion.papelPercent}%` }}
                />
              </div>
              <p className="text-slate-300">
                Regime:{" "}
                <span className="font-semibold text-cyan-300">
                  {marketRegimeLabel(fiiSuggestion.marketRegime)}
                </span>
              </p>
              <p className="text-slate-400">
                Confiança:{" "}
                <span className="font-semibold text-slate-100">
                  {formatPercentage(fiiSuggestion.confidencePercent)}
                </span>
              </p>
              <p className="text-slate-400">
                Juro real:{" "}
                <span className="font-semibold text-slate-100">
                  {formatPercentage(fiiSuggestion.realRatePercent)}
                </span>
              </p>
              <p className="text-slate-500">
                Selic 3M {formatTrendPp(fiiSuggestion.selicTrend3mPercent)} | IPCA 3M{" "}
                {formatTrendPp(fiiSuggestion.ipcaTrend3mPercent)}
              </p>
              <p className="text-[11px] text-slate-500">{fiiSuggestion.rationale}</p>
            </div>
          </article>
        ) : null}
            </div>
          ) : null}
          {dailyInsights && dailyInsights.history.length > 0 ? (
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Histórico diário do diagnóstico</h4>
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {dailyInsights.history.slice(0, 10).map((item) => (
                  <li key={item.runDate}>
                    <span className="text-slate-500">{shortDate(item.runDate)}</span> ·{" "}
                    <span className={radarStyle(item.radarStatus).split(" ").find((c) => c.startsWith("text-"))}>
                      {item.radarStatus}
                    </span>{" "}
                    · {item.headline}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function GoalCard({
  title,
  realized,
  projected,
  target,
  probability,
  footer,
  realizedLabel = "Realizado",
}: {
  title: string;
  /** null: só a projeção (ex.: meta anual de renda, que cobre apenas os meses com meta). */
  realized: number | null;
  projected: number;
  target: number;
  probability: number | null;
  footer: string | null;
  realizedLabel?: string;
}) {
  const realizedPct = target > 0 && realized !== null ? Math.min(100, (realized / target) * 100) : 0;
  const projectedPct = target > 0 ? Math.min(100, (projected / target) * 100) : 0;
  const reached = projected >= target;
  return (
    <article
      className={`rounded-lg border p-4 ${reached ? "border-emerald-600/50 bg-emerald-950/15" : "border-slate-700 bg-slate-900/40"}`}
    >
      <p className="text-xs font-semibold text-slate-200">{title}</p>
      <p className="mt-2 text-sm text-slate-300">
        {realized !== null ? (
          <>
            {realizedLabel} <strong className="text-slate-50">{formatCurrencyBRL(realized)}</strong> de{" "}
          </>
        ) : (
          <>Meta </>
        )}
        {formatCurrencyBRL(target)}
      </p>
      <div className="relative mt-2 h-2 rounded-full bg-slate-700/60">
        <div className="absolute inset-y-0 left-0 rounded-full bg-cyan-400/30" style={{ width: `${projectedPct}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-cyan-400" style={{ width: `${realizedPct}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Projeção <span className={reached ? "text-emerald-300" : "text-amber-300"}>{formatCurrencyBRL(projected)}</span>
        {probability !== null ? ` · chance de atingir ${formatPercentage(probability)}` : ""}
      </p>
      {footer ? <p className="mt-1 text-[11px] text-slate-500">{footer}</p> : null}
    </article>
  );
}
