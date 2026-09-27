import { describe, expect, it } from "vitest";
import {
  buildTaxLots,
  daysBetween,
  estimateInvestmentRedemption,
  estimateRedemptionTax,
  incomeTaxRatePercent,
  iofRatePercent,
  parseLiquidity,
} from "../lib/redemption-tax";

const d = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const AT = d("2026-09-27");

describe("tabelas de IR e IOF", () => {
  it("aplica a tabela regressiva de IR nos limites de cada faixa", () => {
    expect(incomeTaxRatePercent(0)).toBe(22.5);
    expect(incomeTaxRatePercent(180)).toBe(22.5);
    expect(incomeTaxRatePercent(181)).toBe(20);
    expect(incomeTaxRatePercent(360)).toBe(20);
    expect(incomeTaxRatePercent(361)).toBe(17.5);
    expect(incomeTaxRatePercent(720)).toBe(17.5);
    expect(incomeTaxRatePercent(721)).toBe(15);
  });

  it("aplica o IOF regressivo só até o 29º dia", () => {
    expect(iofRatePercent(1)).toBe(96);
    expect(iofRatePercent(10)).toBe(66);
    expect(iofRatePercent(29)).toBe(3);
    expect(iofRatePercent(30)).toBe(0);
    expect(iofRatePercent(365)).toBe(0);
  });

  it("conta dias corridos entre datas", () => {
    expect(daysBetween(d("2026-09-01"), d("2026-09-27"))).toBe(26);
    expect(daysBetween(d("2026-09-27"), d("2026-09-01"))).toBe(0);
  });
});

describe("lotes e resgates", () => {
  it("resgates consomem os lotes mais antigos primeiro (FIFO)", () => {
    const lots = buildTaxLots({
      initialPrincipal: 1000,
      initialDate: d("2025-01-01"),
      initialDateEstimated: false,
      flows: [
        { date: d("2026-01-10"), amount: 500 },
        { date: d("2026-02-01"), amount: -1200 },
      ],
    });
    expect(lots).toHaveLength(1);
    expect(lots[0].amount).toBeCloseTo(300);
    expect(lots[0].date).toEqual(d("2026-01-10"));
  });

  it("calcula o IR de um lote antigo a 15%", () => {
    const tax = estimateRedemptionTax([{ date: d("2024-07-19"), amount: 10000 }], 1000, AT);
    expect(tax.incomeTax).toBeCloseTo(150);
    expect(tax.iof).toBe(0);
    expect(tax.net).toBeCloseTo(10850);
    expect(tax.effectiveRatePercent).toBeCloseTo(15);
  });

  it("cobra IOF antes do IR num aporte recente", () => {
    // 10 dias: IOF 66% de 10 = 6,60; IR 22,5% sobre 3,40 = 0,765
    const tax = estimateRedemptionTax([{ date: d("2026-09-17"), amount: 1000 }], 10, AT);
    expect(tax.iof).toBeCloseTo(6.6);
    expect(tax.incomeTax).toBeCloseTo(0.765);
  });

  it("distribui o rendimento entre lotes por valor × dias", () => {
    const tax = estimateRedemptionTax(
      [
        { date: d("2025-09-27"), amount: 1000 }, // 365 dias
        { date: d("2026-09-17"), amount: 1000 }, // 10 dias
      ],
      375,
      AT,
    );
    expect(tax.lots[0].gain).toBeCloseTo(365);
    expect(tax.lots[1].gain).toBeCloseTo(10);
    expect(tax.lots[0].incomeTaxRatePercent).toBe(17.5);
    expect(tax.lots[1].incomeTaxRatePercent).toBe(22.5);
  });

  it("sinaliza data estimada quando não há data de início", () => {
    const result = estimateInvestmentRedemption({
      balance: 1100,
      totalIncome: 100,
      firstIncomeDate: d("2025-01-01"),
      startDate: null,
      flows: [],
      at: AT,
    });
    expect(result.tax.hasEstimatedDates).toBe(true);
    expect(result.lots[0].date).toEqual(d("2025-01-01"));
  });

  it("separa principal em aplicação inicial e aportes", () => {
    const result = estimateInvestmentRedemption({
      balance: 11000,
      totalIncome: 1000,
      firstIncomeDate: null,
      startDate: d("2024-04-10"),
      flows: [{ date: d("2026-06-19"), amount: 2000 }],
      at: AT,
    });
    expect(result.tax.principal).toBeCloseTo(10000);
    expect(result.lots.map((lot) => lot.amount)).toEqual([8000, 2000]);
    expect(result.tax.effectiveRatePercent).toBeGreaterThan(15);
    expect(result.tax.effectiveRatePercent).toBeLessThan(22.5);
    expect(result.inconsistentIncome).toBe(false);
  });

  it("detecta renda lançada maior que o saldo", () => {
    const result = estimateInvestmentRedemption({
      balance: 100,
      totalIncome: 500,
      firstIncomeDate: null,
      startDate: d("2025-01-01"),
      flows: [],
      at: AT,
    });
    expect(result.inconsistentIncome).toBe(true);
    expect(result.tax.gain).toBe(0);
  });

  it("ignora fluxos posteriores à data do resgate", () => {
    const result = estimateInvestmentRedemption({
      balance: 1000,
      totalIncome: 0,
      firstIncomeDate: null,
      startDate: d("2025-01-01"),
      flows: [{ date: d("2026-12-01"), amount: 500 }],
      at: AT,
    });
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].amount).toBeCloseTo(1000);
  });
});

describe("parseLiquidity", () => {
  it("interpreta as opções do formulário e textos antigos", () => {
    expect(parseLiquidity("Diária")).toEqual({ kind: "diaria", days: 0 });
    expect(parseLiquidity("diaria")).toEqual({ kind: "diaria", days: 0 });
    expect(parseLiquidity("D+1")).toEqual({ kind: "diaria", days: 1 });
    expect(parseLiquidity("D+30")).toEqual({ kind: "prazo", days: 30 });
    expect(parseLiquidity("No vencimento")).toEqual({ kind: "vencimento", days: null });
    expect(parseLiquidity("")).toEqual({ kind: "nao_informada", days: null });
    expect(parseLiquidity(null)).toEqual({ kind: "nao_informada", days: null });
    expect(parseLiquidity("algo estranho")).toEqual({ kind: "nao_informada", days: null });
  });
});
