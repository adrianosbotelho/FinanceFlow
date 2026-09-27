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
  /** Mês em andamento: projeção de fechamento do investimento. */
  projected?: number;
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
  /** Mês em andamento: projeção de fechamento do total e dos FIIs (lib/finance/month-pace). */
  projected_total?: number;
  projected_fii?: number;
  /** Mês em andamento: variação da projeção de fechamento vs o mês anterior (o parcial não é comparado). */
  projected_mom_pct?: number | null;
  projected_mom_value?: number | null;
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

// ─── Ganho por dia útil (Dashboard) ─── ver lib/finance/daily-income.ts

export type DailyIncomePoint = {
  month: number;
  status: "closed" | "in_progress";
  income: number;
  businessDays: number;
  dailyIncome: number;
  /** Capital médio que rendeu no mês (saldo de abertura + ½ fluxo; na estreia, o valor aplicado). */
  balanceBase: number;
  dailyPer10k: number | null;
  /** Mês de estreia sem start_date no mês: valor por dia subestimado. */
  partialDebut: boolean;
  /** Variação do R$/dia útil contra o mês anterior (só entre meses comparáveis). */
  changePercent: number | null;
  changePer10kPercent: number | null;
};

export type DailyIncomeSeries = {
  investmentId: string;
  label: string;
  points: Array<DailyIncomePoint | null>;
  /** Primeiro e último mês fechado comparáveis do ano (para a variação no ano). */
  fromMonth: number | null;
  toMonth: number | null;
  yearChangePercent: number | null;
  yearChangePer10kPercent: number | null;
};

export type DailyIncomePayload = {
  year: number;
  months: number[];
  dataThroughISO: string | null;
  series: DailyIncomeSeries[];
  total: Array<{ month: number; dailyIncome: number; dailyPer10k: number | null; status: "closed" | "in_progress" } | null>;
};

// ─── Retornos: ritmo do mês e lançamento rápido ─── ver app/api/returns/pace

export interface ReturnsPacePayload {
  pace: import("@/lib/finance/month-pace").MonthPace;
  warnings: string[];
  closed: boolean;
  /** Hoje em São Paulo (aaaa-mm-dd). */
  today: string;
}

// ─── Metas: visão geral (cópia dos tipos do desktop, types/index.ts) ───

export type { MonthPace } from "@/lib/finance/month-pace";

export interface GoalProgress {
  // Soma das metas mensais de renda do ano (ou meta via env quando não há metas cadastradas).
  annualIncomeTarget: number;
  // Projeção de renda nos mesmos meses que têm meta.
  annualProjection: number;
  progressPercent: number;
  gapToTarget: number;
  onTrack: boolean;
  source?: "monthly_goals" | "env";
  monthsWithGoal?: number;
  remainingMonthsWithGoal?: number;
}

// Página de Metas: meta mensal de renda e meta anual de patrimônio (CDBs).
export type GoalMonthlyStatus = "atingida" | "no_ritmo" | "perto" | "abaixo" | "sem_meta";
export type GoalAnnualStatus = "atingida" | "no_ritmo" | "abaixo" | "sem_meta";

export interface GoalsMonthlySummary {
  target: number | null;
  realized: number;
  projected: number;
  status: GoalMonthlyStatus;
  neededPerBusinessDay: number | null;
}

export interface GoalsAnnualSummary {
  target: number | null;
  balance: number;
  gap: number;
  progressPercent: number | null;
  expectedIncomeUntilYearEnd: number;
  requiredMonthlyContribution: number | null;
  recentMonthlyContribution: number;
  eta: { year: number; month: number } | null;
  status: GoalAnnualStatus;
}

export interface GoalsMonthCell {
  month: number;
  status: "closed" | "in_progress" | "future";
  target: number | null;
  /** Renda lançada (meses fechados e o atual); null no futuro. */
  realized: number | null;
  /** Projeção de fechamento (só no mês atual). */
  projected: number | null;
  /** Renda possível com o saldo e a taxa contratada, sem novos aportes (mês atual e futuros). */
  possible: number | null;
}

export interface GoalsInvestmentRow {
  investmentId: string;
  label: string;
  institution: string;
  monthly: GoalsMonthlySummary;
  annual: GoalsAnnualSummary;
  monthlyHits: number;
  monthlyGoalMonths: number;
  /** % do CDI contratado (null: sem cadastro; a renda possível usa 100%). */
  contractedCdiPercent: number | null;
  /** Renda possível no mês atual com o saldo e a taxa contratada. */
  possibleMonthlyIncome: number;
  /** Saldo necessário para a meta do mês render sozinha. */
  balanceForMonthlyTarget: number | null;
  /** A meta do mês cabe no que o saldo rende? null sem meta. */
  monthlyTargetReachable: boolean | null;
  /** Folga no FGC da instituição (R$ 250 mil por CPF). */
  fgcHeadroom: number;
  months: GoalsMonthCell[];
}

export interface GoalsMonthlyHistoryPoint {
  month: number;
  status: "closed" | "in_progress";
  target: number | null;
  realized: number;
  projected: number | null;
  hit: boolean | null;
}

export interface GoalsBalancePoint {
  month: number;
  total: number;
  byInvestment: Record<string, number>;
}

export interface GoalsOverviewPayload {
  year: number;
  month: number;
  asOfDate: string | null;
  businessDaysRemaining: number;
  contributionMonthsRemaining: number;
  monthly: GoalsMonthlySummary;
  annual: GoalsAnnualSummary;
  investments: GoalsInvestmentRow[];
  monthlyHistory: GoalsMonthlyHistoryPoint[];
  balanceHistory: GoalsBalancePoint[];
  annualTargets: Record<string, number>;
  /** Meta anual de renda: mesmo cálculo do Dashboard e dos Insights (lib/goal-progress). */
  annualIncome: GoalProgress | null;
  cdiAnnualReference: number;
  warnings: string[];
}
