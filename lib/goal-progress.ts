// Meta anual de renda (Dashboard, Insights e Metas): soma das metas mensais do ano, comparada com a
// projeção dos mesmos meses (realizado nos meses fechados, projeção no mês atual e ritmo por dia útil
// nos seguintes). Sem metas mensais, usa a meta anual configurada.
import { countBusinessDaysInMonth } from "./business-days";
import { GoalProgress, MonthPace } from "../types";

export function buildGoalProgress(
  pace: Pick<MonthPace, "year" | "month" | "projected" | "totalBusinessDays" | "annualProjection">,
  monthlyGoals: Array<{ month: number; monthly_target: number | string | null }>,
  /** Renda total realizada por mês do ano (todas as fontes). */
  totalByMonth: Map<number, number>,
  /** Meta anual usada quando não há metas mensais cadastradas. */
  fallbackAnnualTarget: number,
): GoalProgress {
  const targetByMonth = new Map<number, number>();
  for (const goal of monthlyGoals) {
    const month = Number(goal.month);
    targetByMonth.set(month, (targetByMonth.get(month) ?? 0) + Number(goal.monthly_target ?? 0));
  }
  const goalMonths = Array.from(targetByMonth.entries())
    .filter(([, target]) => target > 0)
    .map(([month]) => month)
    .sort((a, b) => a - b);

  if (goalMonths.length === 0) {
    const annualIncomeTarget = fallbackAnnualTarget;
    const annualProjection = pace.annualProjection;
    return {
      annualIncomeTarget,
      annualProjection,
      progressPercent:
        annualIncomeTarget > 0 ? Math.max(0, Math.min((annualProjection / annualIncomeTarget) * 100, 999)) : 0,
      gapToTarget: Math.max(annualIncomeTarget - annualProjection, 0),
      onTrack: annualProjection >= annualIncomeTarget,
      source: "env",
      monthsWithGoal: 0,
      remainingMonthsWithGoal: 0,
    };
  }

  // Compara a meta só com os meses que têm meta: realizado, projeção do mês atual ou ritmo por dia útil.
  const projectedPerBusinessDay = pace.projected / pace.totalBusinessDays;
  let annualIncomeTarget = 0;
  let annualProjection = 0;
  for (const month of goalMonths) {
    annualIncomeTarget += targetByMonth.get(month) ?? 0;
    if (month < pace.month) {
      annualProjection += totalByMonth.get(month) ?? 0;
    } else if (month === pace.month) {
      annualProjection += pace.projected;
    } else {
      annualProjection += projectedPerBusinessDay * countBusinessDaysInMonth(pace.year, month);
    }
  }

  return {
    annualIncomeTarget,
    annualProjection,
    progressPercent:
      annualIncomeTarget > 0 ? Math.max(0, Math.min((annualProjection / annualIncomeTarget) * 100, 999)) : 0,
    gapToTarget: Math.max(annualIncomeTarget - annualProjection, 0),
    onTrack: annualProjection >= annualIncomeTarget,
    source: "monthly_goals",
    monthsWithGoal: goalMonths.length,
    remainingMonthsWithGoal: goalMonths.filter((month) => month > pace.month).length,
  };
}
