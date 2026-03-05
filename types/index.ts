export type InvestmentType = "CDB" | "FII";

export interface Investment {
  id: string;
  type: InvestmentType;
  institution: string;
  name: string;
  amount_invested: number;
  created_at?: string;
}

export interface MonthlyReturn {
  id: string;
  investment_id: string;
  month: number;
  year: number;
  income_value: number;
}

export interface PassiveIncomeByMonth {
  month: number;
  year: number;
  cdb_itau: number;
  cdb_santander: number;
  fii_dividends: number;
  total: number;
  mom_growth?: number | null;
  yoy_growth?: number | null;
}

export interface DashboardKPIs {
  totalPassiveIncomeCurrentMonth: number;
  cdbTotalYieldCurrentMonth: number;
  fiiDividendsCurrentMonth: number;
  momGrowth: number | null;
  yoyGrowth: number | null;
  ytdPassiveIncome: number;
  portfolioYield: number;
  passiveIncomeCAGR: number | null;
  rolling12Months: number;
  annualProjection: number;
}

export interface IncomeDistribution {
  itauCdb: number;
  santanderCdb: number;
  fii: number;
}

export interface FinancialInsights {
  growthTrend: string;
  bestSource: "CDB_ITAU" | "CDB_SANTANDER" | "FII";
  fiiToCdbRatio: number;
  commentary: string;
}

/** Comparativo mês a mês entre ano anterior e ano atual, por tipo de lançamento */
export interface MonthComparisonPoint {
  month: number;
  monthName: string;
  yearPrev: number;
  yearCurr: number;
  itauPrev: number;
  itauCurr: number;
  santanderPrev: number;
  santanderCurr: number;
  fiiPrev: number;
  fiiCurr: number;
  totalPrev: number;
  totalCurr: number;
}

export interface DashboardPayload {
  kpis: DashboardKPIs;
  monthlySeries: PassiveIncomeByMonth[];
  yoySeries: PassiveIncomeByMonth[];
  /** Comparativo mesmo mês em ano anterior vs ano atual, por tipo (Itaú, Santander, FIIs) */
  comparisonByMonth: MonthComparisonPoint[];
  distribution: IncomeDistribution;
  insights: FinancialInsights;
}
