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

export interface MonthlyClosure {
  year: number;
  month: number;
  is_closed: boolean;
  closed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PassiveIncomeByMonth {
  month: number;
  year: number;
  cdb_itau: number;
  cdb_other: number;
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
  otherCdb: number;
  fii: number;
}

export interface FinancialInsights {
  growthTrend: string;
  bestSource: "CDB_ITAU" | "CDB_OTHER" | "FII";
  fiiToCdbRatio: number;
  commentary: string;
}

export interface GoalProgress {
  annualIncomeTarget: number;
  annualProjection: number;
  progressPercent: number;
  gapToTarget: number;
  onTrack: boolean;
}

export interface ConsistencyAlert {
  code:
    | "MISSING_MONTHS"
    | "MOM_SHARP_DROP"
    | "YOY_NEGATIVE"
    | "NO_DATA_YEAR";
  severity: "info" | "warning" | "critical";
  message: string;
}

/** Comparativo mês a mês entre ano anterior e ano atual, por tipo de lançamento */
export interface MonthComparisonPoint {
  month: number;
  monthName: string;
  yearPrev: number;
  yearCurr: number;
  itauPrev: number;
  itauCurr: number;
  otherCdbPrev: number;
  otherCdbCurr: number;
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
  goalProgress: GoalProgress;
  alerts: ConsistencyAlert[];
}
