import { GoalAnnualStatus, GoalMonthlyStatus, GoalsAnnualSummary } from "../types";

// Meta mensal "perto": projeção de fechamento a partir de 95% da meta.
const NEAR_TARGET_RATIO = 0.95;

export function addMonths(year: number, month: number, count: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + count, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function monthlyGoalStatus(target: number | null, realized: number, projected: number): GoalMonthlyStatus {
  if (target === null || target <= 0) return "sem_meta";
  if (realized >= target) return "atingida";
  if (projected >= target) return "no_ritmo";
  if (projected >= target * NEAR_TARGET_RATIO) return "perto";
  return "abaixo";
}

export function buildAnnualGoalSummary(input: {
  target: number | null;
  balance: number;
  expectedIncomeUntilYearEnd: number;
  recentMonthlyContribution: number;
  monthlyIncome: number;
  contributionMonths: number;
  year: number;
  month: number;
}): GoalsAnnualSummary {
  const { target, balance, expectedIncomeUntilYearEnd, recentMonthlyContribution, monthlyIncome } = input;
  if (target === null || target <= 0) {
    return {
      target: null,
      balance,
      gap: 0,
      progressPercent: null,
      expectedIncomeUntilYearEnd,
      requiredMonthlyContribution: null,
      recentMonthlyContribution,
      eta: null,
      status: "sem_meta",
    };
  }
  const gap = Math.max(0, target - balance);
  const requiredMonthlyContribution = Math.max(0, gap - expectedIncomeUntilYearEnd) / Math.max(1, input.contributionMonths);
  // Prazo no ritmo atual: aportes médios recentes + renda mensal atual.
  const monthlyGrowth = recentMonthlyContribution + monthlyIncome;
  const eta =
    gap <= 0
      ? { year: input.year, month: input.month }
      : monthlyGrowth > 0
        ? addMonths(input.year, input.month, Math.ceil(gap / monthlyGrowth) - 1)
        : null;
  const status: GoalAnnualStatus =
    gap <= 0
      ? "atingida"
      : requiredMonthlyContribution <= recentMonthlyContribution + 0.01 || (eta !== null && eta.year <= input.year)
        ? "no_ritmo"
        : "abaixo";
  return {
    target,
    balance,
    gap,
    progressPercent: (balance / target) * 100,
    expectedIncomeUntilYearEnd,
    requiredMonthlyContribution,
    recentMonthlyContribution,
    eta,
    status,
  };
}
