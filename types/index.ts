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

export interface InvestmentGoal {
  investment_id: string;
  monthly_target: number;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyInvestmentGoal {
  investment_id: string;
  year: number;
  month: number;
  monthly_target: number;
  created_at?: string;
  updated_at?: string;
}

export interface AnnualInvestmentGoal {
  investment_id: string;
  year: number;
  annual_target: number;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyClosure {
  year: number;
  month: number;
  is_closed: boolean;
  closed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyPosition {
  investment_id: string;
  year: number;
  month: number;
  market_value: number;
  taxes_paid: number;
  fees_paid: number;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyMacro {
  year: number;
  month: number;
  inflation_rate: number;
  created_at?: string;
  updated_at?: string;
}

export type CashEventType = "APORTE" | "RESGATE" | "IMPOSTO" | "TAXA";

export interface InvestmentCashEvent {
  id: string;
  investment_id: string;
  event_date: string;
  year: number;
  month: number;
  type: CashEventType;
  amount: number;
  notes?: string | null;
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
  cdbMomGrowth: number | null;
  fiiMomGrowth: number | null;
  yoyGrowth: number | null;
  ytdPassiveIncome: number;
  portfolioYield: number;
  passiveIncomeCAGR: number | null;
  rolling12Months: number;
  annualProjection: number;
  investedCapital: number;
  currentMarketValue: number;
  capitalGain: number;
  capitalGainPct: number;
  totalProfit: number;
  totalProfitPct: number;
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
  cdiAnnualReference: number;
  fiiReinvestment: {
    tijoloPercent: number;
    papelPercent: number;
    confidencePercent: number;
    marketRegime: "JUROS_RESTRITIVOS" | "AFROUXAMENTO_MONETARIO" | "INFLACAO_REACELERANDO" | "EQUILIBRADO";
    realRatePercent: number;
    selicMetaPercent: number;
    ipca12mPercent: number;
    selicTrend3mPercent: number | null;
    ipcaTrend3mPercent: number | null;
    rationale: string;
    updatedAt: string;
  };
  forecastNextMonth: number;
  forecastRangeMin: number;
  forecastRangeMax: number;
  forecastConfidence: number;
  seasonalityFactor: number;
  volatilityPercent: number;
  anomalyDetected: boolean;
  anomalyReason: string | null;
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
  monthlyYieldSummary: {
    month: number | null;
    year: number;
    totalInvested: number;
    totalMonthlyIncome: number;
    portfolioMonthlyYieldPct: number | null;
    items: Array<{
      key: "cdb_itau" | "cdb_santander" | "fiis";
      label: string;
      investedAmount: number;
      monthlyIncome: number;
      monthlyYieldPct: number | null;
      forecastMonthlyIncome: number | null;
      forecastMonthlyYieldPct: number | null;
    }>;
  };
  insights: FinancialInsights;
  goalProgress: GoalProgress;
  alerts: ConsistencyAlert[];
}

export type DailyInsightRadarStatus = "VERDE" | "AMARELO" | "VERMELHO";
export type DailyInsightPriority = "high" | "medium" | "low";
export type DailyInsightRiskLevel = "low" | "medium" | "high";
export type DailyInsightSource = "rule" | "llm";

export interface DailyInsightAction {
  id: string;
  title: string;
  rationale: string;
  expectedImpact: string;
  priority: DailyInsightPriority;
}

export interface DailyInsightRisk {
  id: string;
  title: string;
  level: DailyInsightRiskLevel;
  description: string;
  trigger: string;
}

export interface DailyInsightEvidence {
  id: string;
  label: string;
  value: string;
  context: string;
}

export interface DailyInsightReport {
  runDate: string;
  year: number;
  generatedAt: string;
  generatedBy: DailyInsightSource;
  model: string | null;
  radarStatus: DailyInsightRadarStatus;
  confidencePercent: number;
  headline: string;
  summary: string;
  priorityAction: string;
  actions: DailyInsightAction[];
  risks: DailyInsightRisk[];
  evidence: DailyInsightEvidence[];
}

export interface DailyInsightHistoryItem {
  runDate: string;
  radarStatus: DailyInsightRadarStatus;
  confidencePercent: number;
  headline: string;
  generatedBy: DailyInsightSource;
}

export interface DailyInsightApiPayload {
  source: "cache" | "generated";
  warnings: string[];
  report: DailyInsightReport;
  history: DailyInsightHistoryItem[];
}

export interface MarketSnapshotPayload {
  generatedAt: string;
  selicPercent: number | null;
  cdiDailyPercent: number | null;
  cdiAnnualizedPercent: number | null;
  ibovespaPreviousClose: number | null;
  ibovespaDate: string | null;
  ibovespaDayChangePercent: number | null;
  ifixPreviousClose: number | null;
  ifixDate: string | null;
  ifixDayChangePercent: number | null;
  cryptoQuotes: Array<{
    symbol: "BTC" | "ETH" | "SOL" | "XLM";
    pair: "BTC-USD" | "ETH-USD" | "SOL-USD" | "XLM-USD";
    priceUsd: number | null;
    dayChangePercent: number | null;
    updatedAt: string | null;
  }>;
  warnings: string[];
}

export interface HealthTableCheck {
  table: string;
  status: "ok" | "error";
  count: number | null;
  latencyMs: number;
  error: string | null;
}

export interface HealthApiCheck {
  name: string;
  panel: string;
  source: "internal" | "external";
  endpoint: string;
  method: "GET";
  status: "ok" | "error";
  httpStatus: number | null;
  latencyMs: number;
  error: string | null;
}

export interface HealthCheckPayload {
  status: "ok" | "degraded";
  generatedAt: string;
  app: {
    name: string;
    version: string;
    nodeEnv: string;
    uptimeSec: number;
    nextPublicBaseUrl: string | null;
    financeflowPort: string | null;
  };
  runtime: {
    nodeVersion: string;
    platform: string;
    arch: string;
    pid: number;
  };
  environment: {
    required: Record<string, boolean>;
    missing: string[];
    optional: Record<string, string | null>;
    supabaseHost: string | null;
  };
  database: {
    status: "ok" | "error";
    latencyMs: number | null;
    error: string | null;
    tables: HealthTableCheck[];
  };
  api: {
    status: "ok" | "error";
    checks: HealthApiCheck[];
  };
}

export interface PerformanceKPIs {
  investedCapital: number;
  currentCostBasis: number;
  currentMarketValue: number;
  ytdPassiveIncomeNet: number;
  ytdTaxes: number;
  ytdFees: number;
  nominalReturnPercent: number;
  realReturnPercent: number;
}

export interface PerformanceMonthPoint {
  month: number;
  year: number;
  passiveIncome: number;
  taxes: number;
  fees: number;
  netIncome: number;
  marketValue: number;
  costBasis: number;
  inflationRate: number;
  nominalReturnPercent: number;
  realReturnPercent: number;
}

export interface ConcentrationItem {
  investmentId: string;
  label: string;
  value: number;
  sharePercent: number;
}

export interface PerformancePayload {
  kpis: PerformanceKPIs;
  monthlySeries: PerformanceMonthPoint[];
  concentration: ConcentrationItem[];
  cashEvents: InvestmentCashEvent[];
  inflationSource: "bcb" | "manual" | "none";
  warnings: string[];
}
