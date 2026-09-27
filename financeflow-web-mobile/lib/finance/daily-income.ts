// Cópia fiel de lib/daily-income.ts do app desktop (os projetos são isolados). Mantenha as duas versões iguais;
// os testes em financeflow-web-mobile/tests/ espelham os do desktop.
// Ganho por dia útil: renda de cada CDB no mês ÷ dias úteis em que ele rendeu, e o mesmo valor
// por R$ 10 mil aplicados (separa o efeito da taxa do efeito dos aportes).
// Mês em andamento: só os dias úteis com dado (data-base D−1). Mês de estreia: dias úteis a partir
// de start_date, quando ela cai no próprio mês; sem ela, o mês fica marcado como parcial.
// No mês em andamento, cada investimento vai até a data-base do seu último lançamento (se houver).
import {
  countBusinessDaysBetween,
  countBusinessDaysInMonth,
  previousBusinessDay,
} from "./business-days";
import { BalanceContext, closingBalance, previousYm, ym } from "./balance-history";
import { DailyIncomePayload, DailyIncomePoint, DailyIncomeSeries } from "@/types";

export const PER_AMOUNT = 10_000;

function pct(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

type MonthWindow = { status: "closed" | "in_progress"; end: Date } | null;

// Até que dia o mês tem dado: fim do mês se fechado; D−1 se em andamento; null se futuro.
function monthWindow(year: number, month: number, dataDay: Date): MonthWindow {
  const key = ym(year, month);
  const dataKey = ym(dataDay.getFullYear(), dataDay.getMonth() + 1);
  if (key < dataKey) return { status: "closed", end: new Date(year, month, 0) };
  if (key === dataKey) {
    const lastDay = new Date(year, month, 0);
    return dataDay.getTime() >= lastDay.getTime() ? { status: "closed", end: lastDay } : { status: "in_progress", end: dataDay };
  }
  return null;
}

function buildPoint(
  ctx: BalanceContext,
  startDate: Date | null,
  year: number,
  month: number,
  dataDay: Date,
  lastAsOf: Date | null = null,
): DailyIncomePoint | null {
  const key = ym(year, month);
  if (ctx.firstIncomeYm === null || key < ctx.firstIncomeYm) return null;
  const monthWindowed = monthWindow(year, month, dataDay);
  if (!monthWindowed) return null;
  const window =
    monthWindowed.status === "in_progress" &&
    lastAsOf !== null &&
    ym(lastAsOf.getFullYear(), lastAsOf.getMonth() + 1) === key &&
    lastAsOf.getTime() < monthWindowed.end.getTime()
      ? { status: monthWindowed.status, end: lastAsOf }
      : monthWindowed;

  const income = ctx.incomeByYm.get(key) ?? 0;
  const opening = closingBalance(ctx, previousYm(key));
  const isDebut = key === ctx.firstIncomeYm;
  // Encerrado: sem saldo de abertura e sem renda.
  if (!isDebut && opening <= 0 && income <= 0) return null;

  const monthStart = new Date(year, month - 1, 0); // exclusivo: último dia do mês anterior
  const startsInMonth =
    isDebut && startDate !== null && startDate.getFullYear() === year && startDate.getMonth() + 1 === month;
  const businessDays = startsInMonth
    ? countBusinessDaysBetween(startDate, window.end)
    : window.status === "closed"
      ? countBusinessDaysInMonth(year, month)
      : countBusinessDaysBetween(monthStart, window.end);
  if (businessDays <= 0) return null;

  const balanceBase = isDebut
    ? Math.max(0, closingBalance(ctx, key) - income)
    : opening + (ctx.flowByYm.get(key) ?? 0) / 2;
  const dailyIncome = income / businessDays;
  return {
    month,
    status: window.status,
    income,
    businessDays,
    dailyIncome,
    balanceBase,
    dailyPer10k: balanceBase > 0 ? (dailyIncome / balanceBase) * PER_AMOUNT : null,
    partialDebut: isDebut && !startsInMonth,
    changePercent: null,
    changePer10kPercent: null,
  };
}

export function buildDailyIncome(input: {
  contexts: BalanceContext[];
  labelById?: Map<string, string>;
  startDateById: Map<string, string | null>;
  /** Data-base do último lançamento de cada investimento no mês em andamento. */
  lastAsOfById?: Map<string, Date>;
  year: number;
  today: Date;
}): DailyIncomePayload {
  const { contexts, year, today } = input;
  const dataDay = previousBusinessDay(today);
  const lastMonth =
    year < dataDay.getFullYear() ? 12 : year === dataDay.getFullYear() ? dataDay.getMonth() + 1 : 0;
  const months = Array.from({ length: lastMonth }, (_, i) => i + 1);

  const series: DailyIncomeSeries[] = [];
  for (const ctx of contexts) {
    const startDate = parseIso(input.startDateById.get(ctx.id));
    // Dezembro do ano anterior só serve de base para a variação de janeiro.
    let previous = buildPoint(ctx, startDate, year - 1, 12, dataDay);
    const points = months.map((month) => {
      const point = buildPoint(ctx, startDate, year, month, dataDay, input.lastAsOfById?.get(ctx.id) ?? null);
      if (point && previous && !previous.partialDebut && !point.partialDebut && previous.status === "closed") {
        point.changePercent = pct(point.dailyIncome, previous.dailyIncome);
        point.changePer10kPercent =
          point.dailyPer10k !== null && previous.dailyPer10k !== null ? pct(point.dailyPer10k, previous.dailyPer10k) : null;
      }
      previous = point;
      return point;
    });
    if (points.every((point) => point === null)) continue;

    const comparable = points.filter(
      (point): point is DailyIncomePoint => point !== null && point.status === "closed" && !point.partialDebut,
    );
    const first = comparable[0] ?? null;
    const last = comparable.length > 1 ? comparable[comparable.length - 1] : null;
    series.push({
      investmentId: ctx.id,
      label: input.labelById?.get(ctx.id) ?? ctx.label,
      points,
      fromMonth: first && last ? first.month : null,
      toMonth: last ? last.month : null,
      yearChangePercent: first && last ? pct(last.dailyIncome, first.dailyIncome) : null,
      yearChangePer10kPercent:
        first && last && first.dailyPer10k !== null && last.dailyPer10k !== null
          ? pct(last.dailyPer10k, first.dailyPer10k)
          : null,
    });
  }

  const total = months.map((month, index) => {
    const points = series.map((item) => item.points[index]).filter((point): point is DailyIncomePoint => point !== null);
    if (points.length === 0) return null;
    const dailyIncome = points.reduce((acc, point) => acc + point.dailyIncome, 0);
    const base = points.reduce((acc, point) => acc + point.balanceBase, 0);
    return {
      month,
      dailyIncome,
      dailyPer10k: base > 0 ? (dailyIncome / base) * PER_AMOUNT : null,
      status: points.some((point) => point.status === "in_progress") ? ("in_progress" as const) : ("closed" as const),
    };
  });

  return { year, months, dataThroughISO: lastMonth > 0 ? toIso(dataDay) : null, series, total };
}
