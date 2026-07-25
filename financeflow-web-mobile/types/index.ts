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
}
