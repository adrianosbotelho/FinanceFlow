import { describe, expect, it } from "vitest";
import { applyBalanceDelta, incomeBalanceAdjustments } from "@/lib/finance/income-balance";

// Valores fictícios.
describe("incomeBalanceAdjustments", () => {
  it("novo lançamento soma o valor ao saldo", () => {
    expect(incomeBalanceAdjustments(null, { investmentId: "a", value: 120.5 })).toEqual([
      { investmentId: "a", delta: 120.5 },
    ]);
  });

  it("atualização soma só a diferença (acumulado do mês)", () => {
    expect(
      incomeBalanceAdjustments({ investmentId: "a", value: 800 }, { investmentId: "a", value: 853.79 }),
    ).toEqual([{ investmentId: "a", delta: 53.79 }]);
  });

  it("correção para menos subtrai", () => {
    expect(incomeBalanceAdjustments({ investmentId: "a", value: 900 }, { investmentId: "a", value: 850 })).toEqual([
      { investmentId: "a", delta: -50 },
    ]);
  });

  it("exclusão subtrai o valor lançado", () => {
    expect(incomeBalanceAdjustments({ investmentId: "a", value: 300 }, null)).toEqual([
      { investmentId: "a", delta: -300 },
    ]);
  });

  it("troca de investimento tira do antigo e soma no novo", () => {
    expect(incomeBalanceAdjustments({ investmentId: "a", value: 100 }, { investmentId: "b", value: 110 })).toEqual([
      { investmentId: "a", delta: -100 },
      { investmentId: "b", delta: 110 },
    ]);
  });

  it("sem mudança não gera ajuste", () => {
    expect(incomeBalanceAdjustments({ investmentId: "a", value: 100 }, { investmentId: "a", value: 100 })).toEqual([]);
  });
});

describe("applyBalanceDelta", () => {
  it("arredonda em centavos e não deixa o saldo negativo", () => {
    expect(applyBalanceDelta(10_000, 53.789)).toBe(10_053.79);
    expect(applyBalanceDelta(100, -250)).toBe(0);
  });
});
