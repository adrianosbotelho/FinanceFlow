// Quanto entrou na carteira mês a mês: proventos (renda dos CDBs + dividendos de FIIs) e aportes
// líquidos (APORTE − RESGATE dos eventos de caixa). Janela de 12 meses de calendário terminando no
// mês de análise, mais o acumulado do ano. Função pura (usada pela rota do Dashboard).
import { ContributionFlowMonth, ContributionFlowPayload, ContributionFlowTotals } from "../types";

export type ContributionCashEvent = {
  year: number;
  month: number;
  type: string;
  amount: number | string | null;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function key(year: number, month: number): number {
  return year * 100 + month;
}

function sumTotals(months: ContributionFlowMonth[]): ContributionFlowTotals {
  const totals = months.reduce(
    (acc, item) => {
      acc.income += item.income;
      acc.contributions += item.contributions;
      acc.withdrawals += item.withdrawals;
      return acc;
    },
    { income: 0, contributions: 0, withdrawals: 0 },
  );
  const netContributions = totals.contributions - totals.withdrawals;
  return { ...totals, netContributions, total: totals.income + netContributions };
}

export function buildContributionFlow(input: {
  /** Renda total de cada mês (todas as fontes), por ano/mês. */
  incomeByMonth: Array<{ year: number; month: number; total: number }>;
  cashEvents: ContributionCashEvent[];
  year: number;
  /** Último mês da janela (mês de análise do Dashboard). */
  month: number;
  /** O mês de análise ainda está em andamento (valores parciais). */
  inProgress: boolean;
}): ContributionFlowPayload {
  const income = new Map<number, number>();
  for (const row of input.incomeByMonth) {
    const k = key(row.year, row.month);
    income.set(k, (income.get(k) ?? 0) + toNumber(row.total));
  }
  const contributions = new Map<number, number>();
  const withdrawals = new Map<number, number>();
  for (const event of input.cashEvents) {
    const type = String(event.type ?? "").toUpperCase();
    const k = key(Number(event.year), Number(event.month));
    if (type === "APORTE") contributions.set(k, (contributions.get(k) ?? 0) + toNumber(event.amount));
    else if (type === "RESGATE") withdrawals.set(k, (withdrawals.get(k) ?? 0) + toNumber(event.amount));
  }

  const monthItem = (year: number, month: number): ContributionFlowMonth => {
    const k = key(year, month);
    const monthIncome = income.get(k) ?? 0;
    const monthContributions = contributions.get(k) ?? 0;
    const monthWithdrawals = withdrawals.get(k) ?? 0;
    const netContributions = monthContributions - monthWithdrawals;
    return {
      year,
      month,
      income: monthIncome,
      contributions: monthContributions,
      withdrawals: monthWithdrawals,
      netContributions,
      total: monthIncome + netContributions,
      inProgress: input.inProgress && year === input.year && month === input.month,
    };
  };

  const months: ContributionFlowMonth[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(input.year, input.month - 1 - offset, 1);
    months.push(monthItem(date.getFullYear(), date.getMonth() + 1));
  }
  const yearMonths = Array.from({ length: input.month }, (_, i) => monthItem(input.year, i + 1));

  const closed = months.filter((item) => !item.inProgress);
  const closedTotals = sumTotals(closed);
  const divisor = Math.max(1, closed.length);

  return {
    months,
    last12: sumTotals(months),
    ytd: sumTotals(yearMonths),
    monthlyAverage: {
      income: closedTotals.income / divisor,
      netContributions: closedTotals.netContributions / divisor,
      total: closedTotals.total / divisor,
    },
    averageMonths: closed.length,
  };
}
