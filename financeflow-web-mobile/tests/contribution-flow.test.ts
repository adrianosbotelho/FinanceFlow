import { describe, expect, it } from "vitest";
import { buildContributionFlow } from "@/lib/finance/contribution-flow";

// Valores fictícios. Janela termina em março/2026 (em andamento).
const incomeByMonth = [
  { year: 2025, month: 4, total: 900 },
  { year: 2025, month: 12, total: 1000 },
  { year: 2026, month: 1, total: 1100 },
  { year: 2026, month: 2, total: 1200 },
  { year: 2026, month: 3, total: 600 },
];
const cashEvents = [
  { year: 2025, month: 12, type: "APORTE", amount: 2000 },
  { year: 2026, month: 1, type: "APORTE", amount: 1500 },
  { year: 2026, month: 1, type: "aporte", amount: "500" },
  { year: 2026, month: 2, type: "RESGATE", amount: 300 },
  { year: 2026, month: 2, type: "TAXA", amount: 10 },
  { year: 2025, month: 2, type: "APORTE", amount: 9999 }, // fora da janela
];

function build(inProgress = true) {
  return buildContributionFlow({ incomeByMonth, cashEvents, year: 2026, month: 3, inProgress });
}

describe("contribution-flow", () => {
  it("janela de 12 meses de calendário terminando no mês de análise", () => {
    const flow = build();
    expect(flow.months).toHaveLength(12);
    expect(flow.months[0]).toMatchObject({ year: 2025, month: 4 });
    expect(flow.months[11]).toMatchObject({ year: 2026, month: 3, inProgress: true });
  });

  it("soma proventos e aportes líquidos por mês (taxas e impostos ficam de fora)", () => {
    const flow = build();
    const jan = flow.months.find((item) => item.year === 2026 && item.month === 1);
    expect(jan).toMatchObject({ income: 1100, contributions: 2000, withdrawals: 0, netContributions: 2000, total: 3100 });
    const feb = flow.months.find((item) => item.year === 2026 && item.month === 2);
    expect(feb).toMatchObject({ income: 1200, contributions: 0, withdrawals: 300, netContributions: -300, total: 900 });
    const may = flow.months.find((item) => item.year === 2025 && item.month === 5);
    expect(may?.total).toBe(0);
  });

  it("totais dos 12 meses e do ano", () => {
    const flow = build();
    expect(flow.last12).toEqual({
      income: 4800,
      contributions: 4000,
      withdrawals: 300,
      netContributions: 3700,
      total: 8500,
    });
    expect(flow.ytd).toEqual({
      income: 2900,
      contributions: 2000,
      withdrawals: 300,
      netContributions: 1700,
      total: 4600,
    });
  });

  it("média mensal só com meses fechados", () => {
    const flow = build();
    expect(flow.averageMonths).toBe(11);
    expect(flow.monthlyAverage.income).toBeCloseTo(4200 / 11, 6);
    expect(flow.monthlyAverage.total).toBeCloseTo((4200 + 3700) / 11, 6);
    const closedMonth = build(false);
    expect(closedMonth.averageMonths).toBe(12);
    expect(closedMonth.months[11].inProgress).toBe(false);
  });
});
