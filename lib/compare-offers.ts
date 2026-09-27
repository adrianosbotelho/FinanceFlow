// Comparador de onde aportar: simula ofertas de renda fixa para um valor e um prazo, com IR
// regressivo, IOF, isenção (LCI/LCA/poupança) e taxa de custódia do Tesouro Direto.
import { incomeTaxRatePercent, iofRatePercent } from "./redemption-tax";

export type OfferKind =
  | "CDB_POS"
  | "CDB_PRE"
  | "CDB_IPCA"
  | "LCI_LCA_POS"
  | "LCI_LCA_PRE"
  | "TESOURO_SELIC"
  | "TESOURO_PRE"
  | "TESOURO_IPCA"
  | "POUPANCA";

export type Offer = {
  id: string;
  label: string;
  kind: OfferKind;
  // Pós-fixado: % do CDI. Prefixado: % a.a. IPCA+: juro real % a.a. Tesouro Selic: ágio sobre a Selic (% a.a.).
  rate: number;
};

export type MarketAssumptions = {
  cdiAnnual: number;
  selicAnnual: number;
  ipcaAnnual: number;
};

export type OfferTraits = {
  label: string;
  rateUnit: string;
  taxExempt: boolean;
  guarantee: "FGC" | "Tesouro Nacional";
  custodyAnnualPercent: number;
  custodyExemptAmount: number;
};

// Taxa de custódia da B3 no Tesouro Direto: 0,20% a.a.; Tesouro Selic isento até R$ 10 mil.
const TESOURO_CUSTODY = 0.2;

export const OFFER_KINDS: Record<OfferKind, OfferTraits> = {
  CDB_POS: { label: "CDB/RDB pós (% do CDI)", rateUnit: "% do CDI", taxExempt: false, guarantee: "FGC", custodyAnnualPercent: 0, custodyExemptAmount: 0 },
  CDB_PRE: { label: "CDB prefixado", rateUnit: "% a.a.", taxExempt: false, guarantee: "FGC", custodyAnnualPercent: 0, custodyExemptAmount: 0 },
  CDB_IPCA: { label: "CDB IPCA+", rateUnit: "IPCA + % a.a.", taxExempt: false, guarantee: "FGC", custodyAnnualPercent: 0, custodyExemptAmount: 0 },
  LCI_LCA_POS: { label: "LCI/LCA pós (% do CDI)", rateUnit: "% do CDI", taxExempt: true, guarantee: "FGC", custodyAnnualPercent: 0, custodyExemptAmount: 0 },
  LCI_LCA_PRE: { label: "LCI/LCA prefixada", rateUnit: "% a.a.", taxExempt: true, guarantee: "FGC", custodyAnnualPercent: 0, custodyExemptAmount: 0 },
  TESOURO_SELIC: { label: "Tesouro Selic", rateUnit: "Selic + % a.a.", taxExempt: false, guarantee: "Tesouro Nacional", custodyAnnualPercent: TESOURO_CUSTODY, custodyExemptAmount: 10_000 },
  TESOURO_PRE: { label: "Tesouro Prefixado", rateUnit: "% a.a.", taxExempt: false, guarantee: "Tesouro Nacional", custodyAnnualPercent: TESOURO_CUSTODY, custodyExemptAmount: 0 },
  TESOURO_IPCA: { label: "Tesouro IPCA+", rateUnit: "IPCA + % a.a.", taxExempt: false, guarantee: "Tesouro Nacional", custodyAnnualPercent: TESOURO_CUSTODY, custodyExemptAmount: 0 },
  POUPANCA: { label: "Poupança", rateUnit: "regra oficial", taxExempt: true, guarantee: "FGC", custodyAnnualPercent: 0, custodyExemptAmount: 0 },
};

// CDI anual → taxa anual de X% do CDI (o percentual incide sobre a taxa diária, base 252).
export function annualRateFromPercentOfCdi(cdiAnnual: number, percentOfCdi: number): number {
  const cdiDaily = Math.pow(1 + cdiAnnual / 100, 1 / 252) - 1;
  return (Math.pow(1 + cdiDaily * (percentOfCdi / 100), 252) - 1) * 100;
}

// Inverso: qual % do CDI dá a taxa anual informada.
export function percentOfCdiFromAnnualRate(cdiAnnual: number, annualRate: number): number {
  const cdiDaily = Math.pow(1 + cdiAnnual / 100, 1 / 252) - 1;
  const targetDaily = Math.pow(1 + annualRate / 100, 1 / 252) - 1;
  return cdiDaily > 0 ? (targetDaily / cdiDaily) * 100 : 0;
}

// Poupança: 0,5% a.m. (+TR) com Selic acima de 8,5%; senão 70% da Selic (TR considerada zero).
export function savingsAnnualRate(selicAnnual: number): number {
  if (selicAnnual > 8.5) return (Math.pow(1.005, 12) - 1) * 100;
  return selicAnnual * 0.7;
}

export function grossAnnualRate(offer: Offer, market: MarketAssumptions): number {
  switch (offer.kind) {
    case "CDB_POS":
    case "LCI_LCA_POS":
      return annualRateFromPercentOfCdi(market.cdiAnnual, offer.rate);
    case "CDB_PRE":
    case "LCI_LCA_PRE":
    case "TESOURO_PRE":
      return offer.rate;
    case "CDB_IPCA":
    case "TESOURO_IPCA":
      return ((1 + market.ipcaAnnual / 100) * (1 + offer.rate / 100) - 1) * 100;
    case "TESOURO_SELIC":
      return ((1 + market.selicAnnual / 100) * (1 + offer.rate / 100) - 1) * 100;
    case "POUPANCA":
      return savingsAnnualRate(market.selicAnnual);
  }
}

export type OfferSimulation = {
  offer: Offer;
  traits: OfferTraits;
  grossAnnual: number;
  grossValue: number;
  grossGain: number;
  iof: number;
  incomeTax: number;
  custody: number;
  netValue: number;
  netGain: number;
  netAnnual: number;
  taxRatePercent: number;
  // % do CDI que um CDB tributado precisaria render, no mesmo prazo, para dar o mesmo líquido.
  equivalentCdbPercentOfCdi: number;
};

function netGainFor(input: {
  amount: number;
  days: number;
  grossAnnual: number;
  traits: OfferTraits;
}): { grossGain: number; iof: number; incomeTax: number; custody: number; taxRate: number } {
  const { amount, days, grossAnnual, traits } = input;
  const years = days / 365;
  const grossValue = amount * Math.pow(1 + grossAnnual / 100, years);
  const grossGain = grossValue - amount;
  // Custódia sobre o saldo médio do período, acima da faixa isenta.
  const averageBalance = (amount + grossValue) / 2;
  const custody =
    Math.max(0, averageBalance - traits.custodyExemptAmount) * (traits.custodyAnnualPercent / 100) * years;
  if (traits.taxExempt) return { grossGain, iof: 0, incomeTax: 0, custody, taxRate: 0 };
  const iof = grossGain * (iofRatePercent(days) / 100);
  const taxRate = incomeTaxRatePercent(days);
  const incomeTax = Math.max(0, grossGain - iof - custody) * (taxRate / 100);
  return { grossGain, iof, incomeTax, custody, taxRate };
}

export function simulateOffer(offer: Offer, market: MarketAssumptions, amount: number, days: number): OfferSimulation {
  const traits = OFFER_KINDS[offer.kind];
  const grossAnnual = grossAnnualRate(offer, market);
  const result = netGainFor({ amount, days, grossAnnual, traits });
  const netGain = result.grossGain - result.iof - result.incomeTax - result.custody;
  const netValue = amount + netGain;
  const years = days / 365;
  const netAnnual = years > 0 && amount > 0 ? (Math.pow(netValue / amount, 1 / years) - 1) * 100 : 0;

  // Busca binária do % do CDI de um CDB tributado com o mesmo líquido.
  const cdbTraits = OFFER_KINDS.CDB_POS;
  let low = 0;
  let high = 400;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const candidate = netGainFor({
      amount,
      days,
      grossAnnual: annualRateFromPercentOfCdi(market.cdiAnnual, mid),
      traits: cdbTraits,
    });
    const candidateNet = candidate.grossGain - candidate.iof - candidate.incomeTax;
    if (candidateNet < netGain) low = mid;
    else high = mid;
  }

  return {
    offer,
    traits,
    grossAnnual,
    grossValue: amount + result.grossGain,
    grossGain: result.grossGain,
    iof: result.iof,
    incomeTax: result.incomeTax,
    custody: result.custody,
    netValue,
    netGain,
    netAnnual,
    taxRatePercent: result.taxRate,
    equivalentCdbPercentOfCdi: (low + high) / 2,
  };
}

export function compareOffers(
  offers: Offer[],
  market: MarketAssumptions,
  amount: number,
  days: number,
): OfferSimulation[] {
  return offers
    .map((offer) => simulateOffer(offer, market, amount, days))
    .sort((a, b) => b.netValue - a.netValue);
}
