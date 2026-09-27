import { describe, expect, it } from "vitest";
import { addMonths, buildAnnualGoalSummary, monthlyGoalStatus } from "../lib/goals-math";

describe("monthlyGoalStatus", () => {
  it("classifica pela meta, realizado e projeção", () => {
    expect(monthlyGoalStatus(null, 100, 200)).toBe("sem_meta");
    expect(monthlyGoalStatus(1000, 1000, 1000)).toBe("atingida");
    expect(monthlyGoalStatus(1000, 700, 1050)).toBe("no_ritmo");
    expect(monthlyGoalStatus(1000, 700, 960)).toBe("perto"); // ≥ 95%
    expect(monthlyGoalStatus(1000, 700, 900)).toBe("abaixo");
  });
});

describe("addMonths", () => {
  it("avança meses atravessando o ano", () => {
    expect(addMonths(2026, 11, 3)).toEqual({ year: 2027, month: 2 });
    expect(addMonths(2026, 9, 0)).toEqual({ year: 2026, month: 9 });
  });
});

describe("buildAnnualGoalSummary", () => {
  const base = { year: 2026, month: 9, contributionMonths: 4 };

  it("sem meta cadastrada", () => {
    const summary = buildAnnualGoalSummary({
      ...base,
      target: null,
      balance: 5000,
      expectedIncomeUntilYearEnd: 100,
      recentMonthlyContribution: 0,
      monthlyIncome: 50,
    });
    expect(summary.status).toBe("sem_meta");
    expect(summary.requiredMonthlyContribution).toBeNull();
  });

  it("meta atingida", () => {
    const summary = buildAnnualGoalSummary({
      ...base,
      target: 10000,
      balance: 10500,
      expectedIncomeUntilYearEnd: 300,
      recentMonthlyContribution: 0,
      monthlyIncome: 100,
    });
    expect(summary.status).toBe("atingida");
    expect(summary.gap).toBe(0);
    expect(summary.eta).toEqual({ year: 2026, month: 9 });
  });

  it("calcula o aporte necessário descontando o rendimento esperado", () => {
    // falta 5.000; rendimento até dez 1.000 → (5.000 − 1.000) / 4 = 1.000 por mês
    const summary = buildAnnualGoalSummary({
      ...base,
      target: 20000,
      balance: 15000,
      expectedIncomeUntilYearEnd: 1000,
      recentMonthlyContribution: 1500,
      monthlyIncome: 200,
    });
    expect(summary.gap).toBe(5000);
    expect(summary.requiredMonthlyContribution).toBeCloseTo(1000);
    expect(summary.progressPercent).toBeCloseTo(75);
    expect(summary.status).toBe("no_ritmo"); // aporta 1.500 ≥ 1.000
    // prazo: 5.000 / (1.500 + 200) = 2,94 → 3 meses contando o atual → novembro
    expect(summary.eta).toEqual({ year: 2026, month: 11 });
  });

  it("abaixo do ritmo quando os aportes não bastam e o prazo passa do ano", () => {
    const summary = buildAnnualGoalSummary({
      ...base,
      target: 100000,
      balance: 60000,
      expectedIncomeUntilYearEnd: 2000,
      recentMonthlyContribution: 1000,
      monthlyIncome: 500,
    });
    expect(summary.status).toBe("abaixo");
    expect(summary.requiredMonthlyContribution).toBeCloseTo(9500);
    expect(summary.eta?.year).toBeGreaterThan(2026);
  });

  it("sem aportes nem renda não há prazo", () => {
    const summary = buildAnnualGoalSummary({
      ...base,
      target: 1000,
      balance: 500,
      expectedIncomeUntilYearEnd: 0,
      recentMonthlyContribution: 0,
      monthlyIncome: 0,
    });
    expect(summary.eta).toBeNull();
    expect(summary.status).toBe("abaixo");
  });
});
