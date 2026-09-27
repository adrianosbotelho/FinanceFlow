import { describe, expect, it } from "vitest";
import {
  annualRateFromPercentOfCdi,
  compareOffers,
  grossAnnualRate,
  percentOfCdiFromAnnualRate,
  savingsAnnualRate,
  simulateOffer,
} from "../lib/compare-offers";

// Premissas fictícias de mercado.
const MARKET = { cdiAnnual: 12, selicAnnual: 12.1, ipcaAnnual: 4 };

describe("taxas", () => {
  it("100% do CDI rende o próprio CDI e a conversão é reversível", () => {
    expect(annualRateFromPercentOfCdi(12, 100)).toBeCloseTo(12, 6);
    expect(annualRateFromPercentOfCdi(12, 110)).toBeGreaterThan(13);
    expect(percentOfCdiFromAnnualRate(12, annualRateFromPercentOfCdi(12, 87))).toBeCloseTo(87, 6);
  });

  it("IPCA+ compõe inflação e juro real; Tesouro Selic usa a Selic", () => {
    expect(grossAnnualRate({ id: "a", label: "", kind: "TESOURO_IPCA", rate: 6 }, MARKET)).toBeCloseTo(10.24, 2);
    expect(grossAnnualRate({ id: "b", label: "", kind: "TESOURO_SELIC", rate: 0 }, MARKET)).toBeCloseTo(12.1, 6);
    expect(grossAnnualRate({ id: "c", label: "", kind: "CDB_PRE", rate: 13 }, MARKET)).toBe(13);
  });

  it("poupança segue a regra oficial", () => {
    expect(savingsAnnualRate(12)).toBeCloseTo(6.17, 2); // 0,5% a.m.
    expect(savingsAnnualRate(8)).toBeCloseTo(5.6, 6); // 70% da Selic
  });
});

describe("simulação", () => {
  it("CDB tributado a 100% do CDI por 365 dias paga 17,5% de IR", () => {
    const result = simulateOffer({ id: "x", label: "", kind: "CDB_POS", rate: 100 }, MARKET, 10000, 365);
    expect(result.grossGain).toBeCloseTo(1200, 0);
    expect(result.taxRatePercent).toBe(17.5);
    expect(result.incomeTax).toBeCloseTo(210, 0);
    expect(result.netGain).toBeCloseTo(990, 0);
    expect(result.equivalentCdbPercentOfCdi).toBeCloseTo(100, 1);
  });

  it("LCI/LCA isenta equivale a um CDB com % do CDI maior", () => {
    const lci = simulateOffer({ id: "y", label: "", kind: "LCI_LCA_POS", rate: 90 }, MARKET, 10000, 365);
    expect(lci.incomeTax).toBe(0);
    expect(lci.equivalentCdbPercentOfCdi).toBeGreaterThan(105);
    expect(lci.equivalentCdbPercentOfCdi).toBeLessThan(112);
  });

  it("aplica IOF em prazos menores que 30 dias", () => {
    const result = simulateOffer({ id: "z", label: "", kind: "CDB_POS", rate: 100 }, MARKET, 10000, 10);
    expect(result.iof).toBeCloseTo(result.grossGain * 0.66, 6);
    expect(result.taxRatePercent).toBe(22.5);
  });

  it("cobra custódia no Tesouro acima da faixa isenta", () => {
    const selic = simulateOffer({ id: "s", label: "", kind: "TESOURO_SELIC", rate: 0 }, MARKET, 8000, 365);
    expect(selic.custody).toBe(0); // abaixo de 10 mil
    const pre = simulateOffer({ id: "p", label: "", kind: "TESOURO_PRE", rate: 12 }, MARKET, 10000, 365);
    expect(pre.custody).toBeGreaterThan(20);
    expect(pre.custody).toBeLessThan(22);
  });

  it("ordena pelo valor líquido final", () => {
    const ranking = compareOffers(
      [
        { id: "poupanca", label: "", kind: "POUPANCA", rate: 0 },
        { id: "cdb", label: "", kind: "CDB_POS", rate: 100 },
        { id: "lci", label: "", kind: "LCI_LCA_POS", rate: 95 },
      ],
      MARKET,
      10000,
      720,
    );
    expect(ranking.map((item) => item.offer.id)).toEqual(["lci", "cdb", "poupanca"]);
  });
});
