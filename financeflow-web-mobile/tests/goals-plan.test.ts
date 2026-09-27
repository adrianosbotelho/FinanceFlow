import { describe, expect, it } from "vitest";
import {
  balanceForMonthlyIncome,
  buildContributionPlan,
  monthlyRateForCdi,
  possibleMonthlyIncome,
} from "@/lib/finance/goals-plan";

describe("renda possível", () => {
  it("100% do CDI em 252 dias úteis rende o CDI do ano", () => {
    expect(monthlyRateForCdi(12, 100, 252)).toBeCloseTo(0.12, 8);
  });

  it("mais dias úteis, mais renda; mais % do CDI, mais renda", () => {
    const base = possibleMonthlyIncome({ balance: 100_000, cdiAnnualPercent: 12, percentOfCdi: 100, businessDays: 20 });
    expect(base).toBeCloseTo(100_000 * (Math.pow(1.12, 20 / 252) - 1), 6);
    expect(possibleMonthlyIncome({ balance: 100_000, cdiAnnualPercent: 12, percentOfCdi: 100, businessDays: 23 })).toBeGreaterThan(base);
    expect(possibleMonthlyIncome({ balance: 100_000, cdiAnnualPercent: 12, percentOfCdi: 120, businessDays: 20 })).toBeGreaterThan(base);
  });

  it("saldo necessário é o inverso da renda possível", () => {
    const balance = balanceForMonthlyIncome({ target: 1000, cdiAnnualPercent: 12, percentOfCdi: 100, businessDays: 21 });
    expect(possibleMonthlyIncome({ balance: balance ?? 0, cdiAnnualPercent: 12, percentOfCdi: 100, businessDays: 21 })).toBeCloseTo(1000, 6);
    expect(balanceForMonthlyIncome({ target: 1000, cdiAnnualPercent: 0, percentOfCdi: 100, businessDays: 21 })).toBeNull();
  });
});

describe("plano de aportes", () => {
  const big = 1_000_000;

  it("com orçamento suficiente cobre cada meta e sobra o resto", () => {
    const plan = buildContributionPlan(
      [
        { id: "a", need: 3000, current: 5000, fgcHeadroom: big },
        { id: "b", need: 1000, current: 0, fgcHeadroom: big },
      ],
      6000,
      4,
    );
    expect(plan.items.map((item) => Math.round(item.suggested))).toEqual([3000, 1000]);
    expect(plan.leftover).toBeCloseTo(2000, 6);
    expect(plan.shortfall).toBe(0);
  });

  it("sem orçamento suficiente reparte proporcionalmente ao necessário", () => {
    const plan = buildContributionPlan(
      [
        { id: "a", need: 6000, current: 0, fgcHeadroom: big },
        { id: "b", need: 2000, current: 0, fgcHeadroom: big },
      ],
      4000,
      4,
    );
    expect(plan.items.map((item) => Math.round(item.suggested))).toEqual([3000, 1000]);
    expect(plan.shortfall).toBeCloseTo(4000, 6);
    expect(plan.leftover).toBeCloseTo(0, 6);
  });

  it("respeita a folga do FGC e repassa o excedente", () => {
    const plan = buildContributionPlan(
      [
        { id: "a", need: 5000, current: 0, fgcHeadroom: 4000 }, // até 1.000/mês em 4 meses
        { id: "b", need: 5000, current: 0, fgcHeadroom: big },
      ],
      6000,
      4,
    );
    const [a, b] = plan.items;
    expect(a.suggested).toBeCloseTo(1000, 6);
    expect(a.cappedByFgc).toBe(true);
    expect(b.suggested).toBeCloseTo(5000, 6);
    expect(plan.leftover).toBeCloseTo(0, 6);
  });

  it("meta já atingida não recebe aporte", () => {
    const plan = buildContributionPlan([{ id: "a", need: 0, current: 1000, fgcHeadroom: big }], 1000, 3);
    expect(plan.items[0].suggested).toBe(0);
    expect(plan.leftover).toBe(1000);
  });
});
