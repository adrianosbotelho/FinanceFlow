import { DashboardKPIs, PassiveIncomeByMonth } from "../types";

export function computeMoM(series: PassiveIncomeByMonth[]): void {
  for (let i = 0; i < series.length; i++) {
    const current = series[i];
    const prev = i > 0 ? series[i - 1] : undefined;
    if (!prev || prev.total === 0) {
      current.mom_growth = null;
    } else {
      current.mom_growth = ((current.total - prev.total) / prev.total) * 100;
    }
  }
}

export function computeYoY(
  series: PassiveIncomeByMonth[],
  byKey: (entry: PassiveIncomeByMonth) => string,
): void {
  const map = new Map<string, PassiveIncomeByMonth>();
  for (const entry of series) {
    map.set(byKey(entry), entry);
  }

  for (const entry of series) {
    const keyLastYear = byKey({ ...entry, year: entry.year - 1 });
    const lastYear = map.get(keyLastYear);
    if (!lastYear || lastYear.total === 0) {
      entry.yoy_growth = null;
    } else {
      entry.yoy_growth = ((entry.total - lastYear.total) / lastYear.total) * 100;
    }
  }
}

export function sum(series: PassiveIncomeByMonth[]): number {
  return series.reduce((acc, m) => acc + m.total, 0);
}

export function computeRolling12(series: PassiveIncomeByMonth[]): number {
  const last12 = series.slice(-12);
  return sum(last12);
}

export function computeCAGR(
  series: PassiveIncomeByMonth[],
  years: number,
): number | null {
  if (!series.length || years <= 0) return null;
  const start = series[0].total;
  const end = series[series.length - 1].total;
  if (start <= 0 || end <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function computeAnnualProjection(
  recentMonths: PassiveIncomeByMonth[],
): number {
  if (!recentMonths.length) return 0;
  const last3 = recentMonths.slice(-3);
  const avg =
    last3.reduce((acc, m) => acc + m.total, 0) / Math.max(last3.length, 1);
  return avg * 12;
}

export function buildKpis(
  series: PassiveIncomeByMonth[],
  year: number,
  portfolioTotalInvested: number,
): DashboardKPIs {
  const ordered = [...series].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );
  if (!ordered.length) {
    return {
      totalPassiveIncomeCurrentMonth: 0,
      cdbTotalYieldCurrentMonth: 0,
      fiiDividendsCurrentMonth: 0,
      momGrowth: null,
      cdbMomGrowth: null,
      fiiMomGrowth: null,
      yoyGrowth: null,
      ytdPassiveIncome: 0,
      portfolioYield: 0,
      passiveIncomeCAGR: null,
      rolling12Months: 0,
      annualProjection: 0,
      investedCapital: portfolioTotalInvested,
      currentMarketValue: portfolioTotalInvested,
      capitalGain: 0,
      capitalGainPct: 0,
      totalProfit: 0,
      totalProfitPct: 0,
    };
  }

  computeMoM(ordered);
  computeYoY(ordered, (e) => `${e.year}-${e.month}`);

  const current = ordered[ordered.length - 1];
  const previous = ordered.length > 1 ? ordered[ordered.length - 2] : null;
  const currentCdbTotal = current.cdb_itau + current.cdb_other;
  const previousCdbTotal =
    previous ? previous.cdb_itau + previous.cdb_other : null;
  const cdbMomGrowth =
    previousCdbTotal !== null && previousCdbTotal !== 0
      ? ((currentCdbTotal - previousCdbTotal) / previousCdbTotal) * 100
      : null;
  const fiiMomGrowth =
    previous && previous.fii_dividends !== 0
      ? ((current.fii_dividends - previous.fii_dividends) / previous.fii_dividends) * 100
      : null;

  const ytd = ordered
    .filter((m) => m.year === year)
    .reduce((acc, m) => acc + m.total, 0);

  const rolling12 = computeRolling12(ordered);
  const yearsSpan =
    (ordered[ordered.length - 1].year - ordered[0].year || 1) || 1;
  const cagr = computeCAGR(ordered, yearsSpan);
  const annualProjection = computeAnnualProjection(ordered);

  const portfolioYield =
    portfolioTotalInvested > 0
      ? (rolling12 / portfolioTotalInvested) * 100
      : 0;
  const investedCapital = portfolioTotalInvested;
  const currentMarketValue = investedCapital;
  const capitalGain = currentMarketValue - investedCapital;
  const capitalGainPct =
    investedCapital > 0 ? (capitalGain / investedCapital) * 100 : 0;
  const totalProfit = capitalGain + rolling12;
  const totalProfitPct =
    investedCapital > 0 ? (totalProfit / investedCapital) * 100 : 0;

  return {
    totalPassiveIncomeCurrentMonth: current.total,
    cdbTotalYieldCurrentMonth: currentCdbTotal,
    fiiDividendsCurrentMonth: current.fii_dividends,
    momGrowth: current.mom_growth ?? null,
    cdbMomGrowth,
    fiiMomGrowth,
    yoyGrowth: current.yoy_growth ?? null,
    ytdPassiveIncome: ytd,
    portfolioYield,
    passiveIncomeCAGR: cagr,
    rolling12Months: rolling12,
    annualProjection,
    investedCapital,
    currentMarketValue,
    capitalGain,
    capitalGainPct,
    totalProfit,
    totalProfitPct,
  };
}
