export type InvestmentType = "CDB" | "FII";

export interface Investment {
  id: string;
  type: InvestmentType;
  institution: string;
  name: string;
  amount_invested: number;
  cdi_rate?: number | null;
  benchmark?: string | null;
  start_date?: string | null;
  liquidity?: string | null;
  maturity_date?: string | null;
}

export interface ReturnRow {
  id: string;
  investment_id: string;
  investment_label: string;
  month: number;
  year: number;
  income_value: number;
}

export interface CdbMonthlyEntry {
  investment_id: string;
  label: string;
  income: number;
}

export interface CdbKpiEntry {
  investment_id: string;
  label: string;
  currentMonth: number;
  momGrowth: number | null;
  momDelta: number | null;
  projectedMonth?: number | null;
  projectedMomGrowth?: number | null;
}

export interface DashboardMonth {
  month: number;
  year: number;
  cdb_items: CdbMonthlyEntry[];
  fiis: number;
  total: number;
  mom_pct: number | null;
  mom_value: number | null;
}

export interface DashboardPayload {
  year: number;
  kpis: {
    totalMonth: number;
    cdbMonth: number;
    fiisMonth: number;
    momTotalPct: number | null;
    momCdbPct: number | null;
    momFiisPct: number | null;
    cdbItems: CdbKpiEntry[];
    ytd: number;
    totalInvested: number;
    rolling12: number;
    portfolioYieldPct: number;
    // Mês em andamento: projeção de fechamento (data-base D−1, feriados). Real segue em destaque.
    isCurrentMonth: boolean;
    asOfDate: string | null;
    projectedTotal: number | null;
    projectedMomTotalPct: number | null;
    projectedCdb: number | null;
    projectedMomCdbPct: number | null;
    hasActiveFii: boolean;
  };
  monthlySeries: DashboardMonth[];
}

export interface GoalRow {
  investment_id: string;
  investment_label: string;
  year: number;
  month: number | null;
  target: number;
  current_value: number;
  progress_pct: number | null;
  gap_value: number | null;
  type: "monthly" | "annual";
  // Mesmos cálculos da página de Metas do desktop (lib/finance/goals-math e month-pace).
  status?: "atingida" | "no_ritmo" | "perto" | "abaixo" | "sem_meta";
  projected_value?: number | null;
  needed_per_business_day?: number | null;
  required_monthly_contribution?: number | null;
  recent_monthly_contribution?: number | null;
  eta?: { year: number; month: number } | null;
}

// Performance (cópia dos tipos do desktop, types/index.ts).
export interface PerformanceKPIs {
  currentBalance: number;
  openingBalance: number;
  netContributions: number;
  unrecordedApplications: number;
  grossIncome: number;
  netIncomeAfterTax: number;
  estimatedTaxRatePercent: number;
  estimatedTaxOnRedemption: number;
  balanceAfterTax: number;
  returnPercent: number | null;
  cdiPercent: number | null;
  percentOfCdi: number | null;
  ipcaPercent: number | null;
  realReturnPercent: number | null;
  closedThroughMonth: number | null;
  fiiDividends: number;
}

export interface PerformanceMonthPoint {
  month: number;
  year: number;
  status: "closed" | "in_progress" | "future";
  closingBalance: number | null;
  netContributions: number;
  grossIncome: number;
  returnPercent: number | null;
  cdiPercent: number | null;
  percentOfCdi: number | null;
  ipcaPercent: number | null;
  accumulatedReturnPercent: number | null;
  accumulatedCdiPercent: number | null;
  accumulatedIpcaPercent: number | null;
}

export interface PerformanceInvestmentItem {
  investmentId: string;
  label: string;
  institution: string;
  balance: number;
  sharePercent: number;
  grossIncome: number;
  returnPercent: number | null;
  percentOfCdi: number | null;
  contractedCdiPercent: number | null;
  estimatedTax: number;
  returnMonths: number;
}

export interface PerformanceInstitutionItem {
  institution: string;
  balance: number;
  sharePercent: number;
  fgcLimit: number;
  fgcUsagePercent: number;
  fgcStatus: "ok" | "atencao" | "acima";
}

export interface PerformancePayload {
  year: number;
  kpis: PerformanceKPIs;
  monthlySeries: PerformanceMonthPoint[];
  investments: PerformanceInvestmentItem[];
  institutions: PerformanceInstitutionItem[];
  inflationSource: "bcb" | "manual" | "none";
  warnings: string[];
}
