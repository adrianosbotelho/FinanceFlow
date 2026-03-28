export type InvestmentType = "CDB" | "FII";

export interface Investment {
  id: string;
  type: InvestmentType;
  institution: string;
  name: string;
  amount_invested: number;
}

export interface ReturnRow {
  id: string;
  investment_id: string;
  investment_label: string;
  month: number;
  year: number;
  income_value: number;
}

export interface DashboardMonth {
  month: number;
  year: number;
  cdb_itau: number;
  cdb_santander: number;
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
    cdbItauMonth: number;
    cdbSantanderMonth: number;
    momTotalPct: number | null;
    momCdbPct: number | null;
    momFiisPct: number | null;
    momCdbItauPct: number | null;
    momCdbSantanderPct: number | null;
    momCdbItauValue: number | null;
    momCdbSantanderValue: number | null;
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
  type: "monthly" | "annual";
}
