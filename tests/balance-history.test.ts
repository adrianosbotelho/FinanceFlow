import { describe, expect, it } from "vitest";
import {
  buildBalanceContexts,
  closingBalance,
  compoundPercents,
  monthReturnPercent,
  previousYm,
  ym,
} from "../lib/balance-history";

// Carteira fictícia: um CDB aberto em mar/2026 com saldo atual de 10.300.
const investments = [
  { id: "cdb-a", type: "CDB", institution: "banco a", name: "CDB A", amount_invested: 10300 },
  { id: "fii-x", type: "FII", institution: "B3", name: "FII X", amount_invested: 0 },
  { id: "cdb-encerrado", type: "CDB", institution: "Banco B", name: "CDB B", amount_invested: 0 },
];
const returns = [
  { investment_id: "cdb-a", year: 2026, month: 3, income_value: 50 }, // estreia (parcial)
  { investment_id: "cdb-a", year: 2026, month: 4, income_value: 100 },
  { investment_id: "cdb-a", year: 2026, month: 5, income_value: 150 },
  { investment_id: "fii-x", year: 2026, month: 4, income_value: 80 },
];
const cashEvents = [
  { investment_id: "cdb-a", year: 2026, month: 5, type: "APORTE", amount: 2000 },
  { investment_id: "cdb-a", year: 2026, month: 5, type: "TAXA", amount: 5 },
];

describe("balance-history", () => {
  const contexts = buildBalanceContexts(investments, returns, cashEvents);
  const cdb = contexts[0];

  it("considera só CDBs com saldo ou renda e normaliza a instituição", () => {
    expect(contexts.map((ctx) => ctx.id)).toEqual(["cdb-a"]);
    expect(cdb.institution).toBe("Banco a");
    expect(cdb.firstIncomeYm).toBe(ym(2026, 3));
    expect(cdb.flowByYm.get(ym(2026, 5))).toBe(2000); // TAXA não altera o principal
  });

  it("reconstrói o saldo de cada mês a partir do saldo atual", () => {
    // Saldo fim de mai = atual; fim de abr = 10.300 − 2.000 (aporte de mai) − 150 (renda de mai)
    expect(closingBalance(cdb, ym(2026, 5))).toBeCloseTo(10300);
    expect(closingBalance(cdb, ym(2026, 4))).toBeCloseTo(8150);
    expect(closingBalance(cdb, ym(2026, 3))).toBeCloseTo(8050);
    expect(closingBalance(cdb, ym(2026, 2))).toBe(0); // antes da estreia
  });

  it("calcula a rentabilidade do mês pelo método de Dietz e ignora a estreia", () => {
    expect(monthReturnPercent(contexts, ym(2026, 3))).toBeNull();
    // abr: 100 / 8.050
    expect(monthReturnPercent(contexts, ym(2026, 4))).toBeCloseTo((100 / 8050) * 100);
    // mai: 150 / (8.150 + 2.000/2)
    expect(monthReturnPercent(contexts, ym(2026, 5))).toBeCloseTo((150 / 9150) * 100);
  });

  it("encadeia percentuais mensais ignorando meses sem dado", () => {
    expect(compoundPercents([1, 1])).toBeCloseTo(2.01);
    expect(compoundPercents([1, null, 2])).toBeCloseTo(3.02);
    expect(compoundPercents([null])).toBeNull();
  });

  it("volta um mês atravessando o ano", () => {
    expect(previousYm(ym(2026, 1))).toBe(ym(2025, 12));
    expect(previousYm(ym(2026, 7))).toBe(ym(2026, 6));
  });
});
