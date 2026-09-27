// Cópia fiel de lib/month-pace.ts do app desktop (os projetos são isolados). Mantenha as duas versões iguais;
// os testes em financeflow-web-mobile/tests/ espelham os do desktop.
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  countBusinessDaysBetween,
  countBusinessDaysInMonth,
  previousBusinessDay,
} from "./business-days";
export type InvestmentType = "CDB" | "FII";

export interface MonthPaceInvestment {
  investmentId: string;
  label: string;
  type: InvestmentType;
  invested: number;
  realized: number;
  asOfDate: string | null;
  elapsedBusinessDays: number;
  remainingBusinessDays: number;
  dailyRate: number;
  projected: number;
}

export interface MonthPaceClosedMonth {
  year: number;
  month: number;
  total: number;
  businessDays: number;
}

export interface MonthPace {
  year: number;
  month: number;
  isCurrentMonth: boolean;
  asOfDate: string | null;
  totalBusinessDays: number;
  elapsedBusinessDays: number;
  remainingBusinessDays: number;
  elapsedRatio: number;
  realized: number;
  projected: number;
  dailyRate: number;
  previousMonthTotal: number | null;
  previousMonthBusinessDays: number;
  // Renda esperada até a data-base de cada investimento, no ritmo por dia útil do mês anterior.
  expectedToDate: number | null;
  sameMonthLastYearTotal: number | null;
  projectedVsPreviousPercent: number | null;
  paceDeltaPercent: number | null;
  yoyPercent: number | null;
  anomaly: { detected: boolean; reason: string | null };
  volatilityPercent: number;
  ytdRealized: number;
  annualProjection: number;
  hasActiveFii: boolean;
  bestInvestment: { investmentId: string; label: string } | null;
  bestYieldInvestment: { investmentId: string; label: string; monthlyYieldPercent: number } | null;
  investments: MonthPaceInvestment[];
  closedMonths: MonthPaceClosedMonth[];
}


// Versão do motor de insights. Históricos gravados com outra versão não são exibidos.
export const INSIGHTS_ENGINE_VERSION = "2026-09-26-v4";

// Janela (em dias úteis) usada para medir o ganho diário recente a partir das revisões.
const RATE_WINDOW_BUSINESS_DAYS = 5;

export type PaceInvestmentRow = {
  id: string;
  type: InvestmentType;
  institution: string;
  name: string;
  amount_invested: number | string | null;
};

export type PaceReturnRow = {
  investment_id: string;
  year: number;
  month: number;
  income_value: number | string | null;
};

export type PaceRevisionRow = {
  investment_id: string;
  new_income_value: number | string | null;
  created_at: string;
};

function toNum(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function saoPauloDateOf(timestamp: string): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
  return parseIsoDate(iso);
}

// Um lançamento feito no dia D representa o acumulado até o dia útil anterior.
export function asOfDateForEntry(timestamp: string): Date {
  return previousBusinessDay(saoPauloDateOf(timestamp));
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function previousMonthOf(year: number, month: number): { year: number; month: number } {
  return month > 1 ? { year, month: month - 1 } : { year: year - 1, month: 12 };
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function pctChange(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function buildMonthPace(input: {
  year: number;
  month: number;
  today: Date;
  investments: PaceInvestmentRow[];
  returns: PaceReturnRow[];
  revisions: PaceRevisionRow[];
}): MonthPace {
  const { year, month, today, investments, returns, revisions } = input;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const dayBeforeMonth = new Date(year, month - 1, 0);
  const totalBusinessDays = Math.max(1, countBusinessDaysInMonth(year, month));
  const isCurrentMonth = today >= monthStart && today <= monthEnd;
  const defaultAsOf = previousBusinessDay(today);

  const totalsByMonth = new Map<string, number>();
  const valueByInvestmentMonth = new Map<string, number>();
  for (const row of returns) {
    const income = toNum(row.income_value);
    const key = monthKey(row.year, row.month);
    totalsByMonth.set(key, (totalsByMonth.get(key) ?? 0) + income);
    const invKey = `${row.investment_id}|${key}`;
    valueByInvestmentMonth.set(invKey, (valueByInvestmentMonth.get(invKey) ?? 0) + income);
  }

  const prevRef = previousMonthOf(year, month);
  const previousMonthBusinessDays = Math.max(1, countBusinessDaysInMonth(prevRef.year, prevRef.month));

  const revisionsByInvestment = new Map<string, PaceRevisionRow[]>();
  for (const row of revisions) {
    const list = revisionsByInvestment.get(row.investment_id) ?? [];
    list.push(row);
    revisionsByInvestment.set(row.investment_id, list);
  }

  const paceInvestments: MonthPaceInvestment[] = [];
  let expectedToDate = 0;
  let hasExpectedBase = false;
  for (const inv of investments) {
    const invested = toNum(inv.amount_invested);
    const realized = valueByInvestmentMonth.get(`${inv.id}|${monthKey(year, month)}`) ?? 0;
    // Investimento sem posição e sem renda no mês (ex.: FIIs encerrados) fica fora do motor.
    if (invested <= 0 && realized <= 0) continue;

    const label = inv.name || `${inv.type} ${inv.institution}`;
    const previousValue = valueByInvestmentMonth.get(`${inv.id}|${monthKey(prevRef.year, prevRef.month)}`) ?? 0;
    const previousPerBusinessDay = previousValue / previousMonthBusinessDays;
    if (previousValue > 0) hasExpectedBase = true;

    if (!isCurrentMonth) {
      expectedToDate += previousPerBusinessDay * totalBusinessDays;
      paceInvestments.push({
        investmentId: inv.id,
        label,
        type: inv.type,
        invested,
        realized,
        asOfDate: toIsoDate(monthEnd),
        elapsedBusinessDays: totalBusinessDays,
        remainingBusinessDays: 0,
        dailyRate: realized / totalBusinessDays,
        projected: realized,
      });
      continue;
    }

    // Pontos (data-base, valor) a partir das revisões; fica o último valor de cada data-base.
    const pointsByAsOf = new Map<string, number>();
    const sortedRevisions = (revisionsByInvestment.get(inv.id) ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const rev of sortedRevisions) {
      pointsByAsOf.set(toIsoDate(asOfDateForEntry(rev.created_at)), toNum(rev.new_income_value));
    }
    const points = Array.from(pointsByAsOf.entries())
      .map(([asOf, value]) => ({ asOf: parseIsoDate(asOf), value }))
      .sort((a, b) => a.asOf.getTime() - b.asOf.getTime());

    const latestAsOf = points.length ? points[points.length - 1].asOf : realized > 0 ? defaultAsOf : null;
    const effectiveAsOf =
      latestAsOf === null || latestAsOf < monthStart
        ? null
        : latestAsOf > monthEnd
          ? monthEnd
          : latestAsOf;
    const elapsedBusinessDays = effectiveAsOf ? countBusinessDaysBetween(dayBeforeMonth, effectiveAsOf) : 0;
    const remainingBusinessDays = countBusinessDaysBetween(effectiveAsOf ?? dayBeforeMonth, monthEnd);

    expectedToDate += previousPerBusinessDay * elapsedBusinessDays;

    let dailyRate = 0;
    if (effectiveAsOf && points.length >= 2) {
      const reference = points.find((point) => {
        if (point.asOf >= effectiveAsOf || point.asOf < monthStart) return false;
        const gap = countBusinessDaysBetween(point.asOf, effectiveAsOf);
        return gap >= 1 && gap <= RATE_WINDOW_BUSINESS_DAYS;
      });
      if (reference) {
        const gap = countBusinessDaysBetween(reference.asOf, effectiveAsOf);
        dailyRate = (realized - reference.value) / gap;
      }
    }
    if (!(dailyRate > 0)) {
      dailyRate =
        elapsedBusinessDays > 0
          ? realized / elapsedBusinessDays
          : previousValue / previousMonthBusinessDays;
    }

    paceInvestments.push({
      investmentId: inv.id,
      label,
      type: inv.type,
      invested,
      realized,
      asOfDate: effectiveAsOf ? toIsoDate(effectiveAsOf) : null,
      elapsedBusinessDays,
      remainingBusinessDays,
      dailyRate,
      projected: realized + dailyRate * remainingBusinessDays,
    });
  }

  const realized = totalsByMonth.get(monthKey(year, month)) ?? 0;
  const projected = paceInvestments.reduce((acc, item) => acc + item.projected, 0);
  const dailyRate = paceInvestments.reduce((acc, item) => acc + item.dailyRate, 0);

  const asOfDates = paceInvestments
    .map((item) => item.asOfDate)
    .filter((value): value is string => value !== null)
    .sort();
  const asOfDate = asOfDates.length ? asOfDates[asOfDates.length - 1] : null;
  const elapsedBusinessDays = isCurrentMonth
    ? asOfDate
      ? countBusinessDaysBetween(dayBeforeMonth, parseIsoDate(asOfDate))
      : 0
    : totalBusinessDays;
  const remainingBusinessDays = Math.max(0, totalBusinessDays - elapsedBusinessDays);

  const previousMonthTotal = totalsByMonth.get(monthKey(prevRef.year, prevRef.month)) ?? null;
  const sameMonthLastYearTotal = totalsByMonth.get(monthKey(year - 1, month)) ?? null;

  const projectedPerBusinessDay = projected / totalBusinessDays;
  const previousPerBusinessDay =
    previousMonthTotal !== null ? previousMonthTotal / previousMonthBusinessDays : null;

  const closedMonths: MonthPaceClosedMonth[] = Array.from(totalsByMonth.entries())
    .map(([key, total]) => {
      const [y, m] = key.split("-").map(Number);
      return { year: y, month: m, total, businessDays: Math.max(1, countBusinessDaysInMonth(y, m)) };
    })
    .filter((item) => item.year < year || (item.year === year && item.month < month))
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12);

  // Anomalia e volatilidade usam renda por dia útil, só com meses fechados de referência.
  const baselinePerDay = closedMonths.slice(-6).map((item) => item.total / item.businessDays);
  const baselineStd = stdDev(baselinePerDay);
  let anomaly: MonthPace["anomaly"] = { detected: false, reason: null };
  if (baselinePerDay.length >= 3 && baselineStd > 0) {
    const zScore = (projectedPerBusinessDay - mean(baselinePerDay)) / baselineStd;
    if (zScore <= -2) anomaly = { detected: true, reason: "projeção do mês abaixo do padrão histórico recente" };
    if (zScore >= 2) anomaly = { detected: true, reason: "projeção do mês acima do padrão histórico recente" };
  }
  const baselineMean = mean(baselinePerDay);
  const volatilityPercent = baselineMean > 0 ? (baselineStd / baselineMean) * 100 : 0;

  const ytdRealized = closedMonths
    .filter((item) => item.year === year)
    .reduce((acc, item) => acc + item.total, 0);
  let remainingYearBusinessDays = 0;
  for (let m = month + 1; m <= 12; m += 1) {
    remainingYearBusinessDays += countBusinessDaysInMonth(year, m);
  }
  const annualProjection = ytdRealized + projected + projectedPerBusinessDay * remainingYearBusinessDays;

  const best = paceInvestments.slice().sort((a, b) => b.projected - a.projected)[0] ?? null;
  const bestYield =
    paceInvestments
      .filter((item) => item.invested > 0)
      .map((item) => ({ item, yieldPercent: (item.projected / item.invested) * 100 }))
      .sort((a, b) => b.yieldPercent - a.yieldPercent)[0] ?? null;

  return {
    year,
    month,
    isCurrentMonth,
    asOfDate,
    totalBusinessDays,
    elapsedBusinessDays,
    remainingBusinessDays,
    elapsedRatio: elapsedBusinessDays / totalBusinessDays,
    realized,
    projected,
    dailyRate,
    previousMonthTotal,
    previousMonthBusinessDays,
    expectedToDate: hasExpectedBase ? expectedToDate : null,
    sameMonthLastYearTotal,
    projectedVsPreviousPercent: pctChange(projected, previousMonthTotal),
    paceDeltaPercent:
      previousPerBusinessDay !== null ? pctChange(projectedPerBusinessDay, previousPerBusinessDay) : null,
    yoyPercent: pctChange(projected, sameMonthLastYearTotal),
    anomaly,
    volatilityPercent,
    ytdRealized,
    annualProjection,
    hasActiveFii: paceInvestments.some((item) => item.type === "FII"),
    bestInvestment: best ? { investmentId: best.investmentId, label: best.label } : null,
    bestYieldInvestment: bestYield
      ? {
          investmentId: bestYield.item.investmentId,
          label: bestYield.item.label,
          monthlyYieldPercent: bestYield.yieldPercent,
        }
      : null,
    investments: paceInvestments,
    closedMonths,
  };
}

function isMissingTableError(message: string | undefined, table: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes(table) && (lower.includes("does not exist") || lower.includes("could not find"));
}

export async function loadMonthPace(
  year: number,
  month: number,
  todayIso: string,
): Promise<{ pace: MonthPace; warnings: string[] }> {
  const supabase = getSupabaseServerClient();
  const warnings: string[] = [];
  const [investmentsRes, returnsRes, revisionsRes] = await Promise.all([
    supabase.from("investments").select("id,type,institution,name,amount_invested"),
    supabase
      .from("monthly_returns")
      .select("investment_id,year,month,income_value")
      .gte("year", year - 1)
      .lte("year", year),
    supabase
      .from("monthly_return_revisions")
      .select("investment_id,new_income_value,created_at")
      .eq("year", year)
      .eq("month", month),
  ]);

  if (investmentsRes.error || returnsRes.error) {
    throw new Error(investmentsRes.error?.message ?? returnsRes.error?.message ?? "Erro ao ler dados do mês.");
  }
  if (revisionsRes.error) {
    warnings.push(
      isMissingTableError(revisionsRes.error.message, "monthly_return_revisions")
        ? "Tabela monthly_return_revisions não existe. Ritmo diário estimado pela média do mês."
        : `Falha ao ler revisões: ${revisionsRes.error.message}`,
    );
  }

  const pace = buildMonthPace({
    year,
    month,
    today: parseIsoDate(todayIso),
    investments: (investmentsRes.data ?? []) as PaceInvestmentRow[],
    returns: (returnsRes.data ?? []) as PaceReturnRow[],
    revisions: (revisionsRes.data ?? []) as PaceRevisionRow[],
  });
  return { pace, warnings };
}
