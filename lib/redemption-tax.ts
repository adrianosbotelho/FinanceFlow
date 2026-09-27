// Tributação no resgate de renda fixa tributada (CDBs e similares): IR pela tabela regressiva
// sobre o rendimento de cada aplicação (lote) e IOF regressivo nos primeiros 29 dias.
// O IR incide sobre o rendimento, não sobre o principal; o IOF incide antes do IR.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Tabela regressiva de IR (Lei 11.033/2004), por dias corridos desde a aplicação.
export function incomeTaxRatePercent(days: number): number {
  if (days <= 180) return 22.5;
  if (days <= 360) return 20;
  if (days <= 720) return 17.5;
  return 15;
}

// IOF regressivo (Decreto 6.306/2007, anexo): % do rendimento retido para resgates antes de 30 dias.
const IOF_TABLE = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];

export function iofRatePercent(days: number): number {
  if (days < 1) return 96;
  if (days >= 30) return 0;
  return IOF_TABLE[days - 1];
}

export function daysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

export type TaxLot = {
  date: Date;
  amount: number;
  // true quando a data da aplicação inicial foi estimada (sem start_date cadastrada).
  estimatedDate?: boolean;
};

export type CashFlow = { date: Date; amount: number };

export type LotTax = {
  date: Date;
  amount: number;
  days: number;
  gain: number;
  iof: number;
  incomeTax: number;
  incomeTaxRatePercent: number;
  estimatedDate: boolean;
};

export type RedemptionTax = {
  principal: number;
  gain: number;
  iof: number;
  incomeTax: number;
  totalTax: number;
  net: number;
  effectiveRatePercent: number | null;
  averageDays: number | null;
  hasEstimatedDates: boolean;
  lots: LotTax[];
};

// Lotes de principal: aplicação inicial + aportes; resgates consomem os lotes mais antigos (FIFO).
export function buildTaxLots(input: {
  initialPrincipal: number;
  initialDate: Date;
  initialDateEstimated: boolean;
  flows: CashFlow[];
}): TaxLot[] {
  const lots: TaxLot[] = [];
  if (input.initialPrincipal > 0.005) {
    lots.push({ date: input.initialDate, amount: input.initialPrincipal, estimatedDate: input.initialDateEstimated });
  }
  const ordered = input.flows.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const flow of ordered) {
    if (flow.amount > 0) {
      lots.push({ date: flow.date, amount: flow.amount });
      continue;
    }
    let toRedeem = -flow.amount;
    for (const lot of lots) {
      if (toRedeem <= 0) break;
      const used = Math.min(lot.amount, toRedeem);
      lot.amount -= used;
      toRedeem -= used;
    }
  }
  return lots.filter((lot) => lot.amount > 0.005).sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Rendimento acumulado distribuído entre os lotes proporcionalmente a valor × dias aplicados
// (aproximação: lotes mais antigos e maiores renderam mais).
export function estimateRedemptionTax(lots: TaxLot[], totalGain: number, at: Date): RedemptionTax {
  const principal = lots.reduce((acc, lot) => acc + lot.amount, 0);
  const gain = Math.max(0, totalGain);
  const weights = lots.map((lot) => lot.amount * Math.max(1, daysBetween(lot.date, at)));
  const totalWeight = weights.reduce((acc, value) => acc + value, 0);

  const lotTaxes: LotTax[] = lots.map((lot, index) => {
    const days = daysBetween(lot.date, at);
    const lotGain = totalWeight > 0 ? (gain * weights[index]) / totalWeight : 0;
    const iof = lotGain * (iofRatePercent(days) / 100);
    const rate = incomeTaxRatePercent(days);
    const incomeTax = (lotGain - iof) * (rate / 100);
    return {
      date: lot.date,
      amount: lot.amount,
      days,
      gain: lotGain,
      iof,
      incomeTax,
      incomeTaxRatePercent: rate,
      estimatedDate: Boolean(lot.estimatedDate),
    };
  });

  const iof = lotTaxes.reduce((acc, lot) => acc + lot.iof, 0);
  const incomeTax = lotTaxes.reduce((acc, lot) => acc + lot.incomeTax, 0);
  const totalTax = iof + incomeTax;
  return {
    principal,
    gain,
    iof,
    incomeTax,
    totalTax,
    net: principal + gain - totalTax,
    effectiveRatePercent: gain > 0 ? (totalTax / gain) * 100 : null,
    averageDays: principal > 0 ? lotTaxes.reduce((acc, lot) => acc + lot.days * lot.amount, 0) / principal : null,
    hasEstimatedDates: lotTaxes.some((lot) => lot.estimatedDate),
    lots: lotTaxes,
  };
}

// Liquidez cadastrada (texto livre ou opção do formulário) → prazo em dias corridos para ter o dinheiro.
export type LiquidityKind = "diaria" | "prazo" | "vencimento" | "nao_informada";

export function parseLiquidity(value: string | null | undefined): { kind: LiquidityKind; days: number | null } {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!text) return { kind: "nao_informada", days: null };
  if (/vencimento|final/.test(text)) return { kind: "vencimento", days: null };
  if (/diaria|imediata|d\s*\+\s*0\b/.test(text)) return { kind: "diaria", days: 0 };
  const match = /d\s*\+\s*(\d+)/.exec(text);
  if (match) {
    const days = Number(match[1]);
    return days <= 1 ? { kind: "diaria", days } : { kind: "prazo", days };
  }
  return { kind: "nao_informada", days: null };
}

// IR/IOF de um investimento a partir do saldo atual (principal + renda reinvestida), da renda
// lançada e dos aportes/resgates. Sem data de início, a aplicação inicial é datada no primeiro mês
// com renda (estimativa).
export function estimateInvestmentRedemption(input: {
  balance: number;
  totalIncome: number;
  firstIncomeDate: Date | null;
  startDate: Date | null;
  flows: CashFlow[];
  at: Date;
  extraGain?: number;
}): { tax: RedemptionTax; lots: TaxLot[]; inconsistentIncome: boolean; inconsistentFlows: boolean } {
  let gain = Math.max(0, input.totalIncome);
  let principal = input.balance - gain;
  const inconsistentIncome = principal <= 0;
  if (inconsistentIncome) {
    principal = input.balance;
    gain = 0;
  }
  const flows = input.flows.filter((flow) => flow.date <= input.at);
  const netFlows = flows.reduce((acc, flow) => acc + flow.amount, 0);
  const lots = buildTaxLots({
    initialPrincipal: Math.max(0, principal - netFlows),
    initialDate: input.startDate ?? input.firstIncomeDate ?? input.at,
    initialDateEstimated: !input.startDate,
    flows,
  });
  return {
    tax: estimateRedemptionTax(lots, gain + (input.extraGain ?? 0), input.at),
    lots,
    inconsistentIncome,
    inconsistentFlows: principal - netFlows < -1,
  };
}
