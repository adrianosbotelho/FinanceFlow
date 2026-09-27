import { describe, expect, it } from "vitest";
import { buildGoalProgress } from "../lib/goal-progress";
import { countBusinessDaysInMonth } from "../lib/business-days";

// Valores fictícios: setembro/2026 em andamento, 21 dias úteis, projeção de 2.100.
const pace = { year: 2026, month: 9, projected: 2100, totalBusinessDays: 21, annualProjection: 30000 };
const totals = new Map([
  [7, 2000],
  [8, 1900],
]);

describe("buildGoalProgress", () => {
  it("soma só os meses com meta: realizado, projeção do mês e ritmo por dia útil depois", () => {
    const goals = [
      { month: 7, monthly_target: 1000 },
      { month: 7, monthly_target: 900 },
      { month: 8, monthly_target: 2000 },
      { month: 9, monthly_target: 2000 },
      { month: 10, monthly_target: 2000 },
      { month: 11, monthly_target: 0 },
    ];
    const result = buildGoalProgress(pace, goals, totals, 12000);
    expect(result.source).toBe("monthly_goals");
    expect(result.monthsWithGoal).toBe(4);
    expect(result.remainingMonthsWithGoal).toBe(1);
    expect(result.annualIncomeTarget).toBe(7900);
    const october = (2100 / 21) * countBusinessDaysInMonth(2026, 10);
    expect(result.annualProjection).toBeCloseTo(2000 + 1900 + 2100 + october, 6);
    expect(result.onTrack).toBe(true);
    expect(result.gapToTarget).toBe(0);
  });

  it("sem metas mensais usa a meta anual configurada e a projeção do ano", () => {
    const result = buildGoalProgress(pace, [], totals, 40000);
    expect(result.source).toBe("env");
    expect(result.annualIncomeTarget).toBe(40000);
    expect(result.gapToTarget).toBe(10000);
    expect(result.onTrack).toBe(false);
  });
});
