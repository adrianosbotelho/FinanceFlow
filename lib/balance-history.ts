// Reconstrução do saldo de cada investimento mês a mês. amount_invested é o saldo atual
// (principal + renda reinvestida); o saldo no fim de uma competência é o saldo atual menos os
// aportes/resgates e a renda lançados depois dela. Antes do mês de estreia (primeira renda),
// o investimento ainda não existia.

export type BalanceInvestmentRow = {
  id: string;
  type: string;
  institution: string;
  name: string;
  amount_invested: number | string | null;
  cdi_rate?: number | string | null;
};

export type BalanceReturnRow = {
  investment_id: string;
  year: number;
  month: number;
  income_value: number | string | null;
};

export type BalanceCashEventRow = {
  investment_id: string;
  year: number;
  month: number;
  type: string;
  amount: number | string | null;
};

export type BalanceContext = {
  id: string;
  label: string;
  institution: string;
  balanceNow: number;
  contractedCdiPercent: number | null;
  firstIncomeYm: number | null;
  incomeByYm: Map<number, number>;
  flowByYm: Map<number, number>;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function ym(year: number, month: number): number {
  return year * 100 + month;
}

export function previousYm(value: number): number {
  const year = Math.floor(value / 100);
  const month = value % 100;
  return month === 1 ? ym(year - 1, 12) : value - 1;
}

function normalizeInstitution(value: string): string {
  const trimmed = value.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function buildBalanceContexts(
  investments: BalanceInvestmentRow[],
  returns: BalanceReturnRow[],
  cashEvents: BalanceCashEventRow[],
  type = "CDB",
): BalanceContext[] {
  const contexts: BalanceContext[] = investments
    .filter((inv) => inv.type === type)
    .map((inv) => ({
      id: inv.id,
      label: inv.name,
      institution: normalizeInstitution(inv.institution),
      balanceNow: toNumber(inv.amount_invested),
      contractedCdiPercent: toNumber(inv.cdi_rate) > 0 ? toNumber(inv.cdi_rate) : null,
      firstIncomeYm: null,
      incomeByYm: new Map<number, number>(),
      flowByYm: new Map<number, number>(),
    }));
  const byId = new Map(contexts.map((ctx) => [ctx.id, ctx]));

  for (const row of returns) {
    const ctx = byId.get(row.investment_id);
    if (!ctx) continue;
    const key = ym(Number(row.year), Number(row.month));
    ctx.incomeByYm.set(key, (ctx.incomeByYm.get(key) ?? 0) + toNumber(row.income_value));
  }
  for (const event of cashEvents) {
    const ctx = byId.get(event.investment_id);
    const eventType = String(event.type ?? "").toUpperCase();
    if (!ctx || (eventType !== "APORTE" && eventType !== "RESGATE")) continue;
    const key = ym(Number(event.year), Number(event.month));
    const signed = eventType === "APORTE" ? toNumber(event.amount) : -toNumber(event.amount);
    ctx.flowByYm.set(key, (ctx.flowByYm.get(key) ?? 0) + signed);
  }
  for (const ctx of contexts) {
    const incomeKeys = Array.from(ctx.incomeByYm.entries())
      .filter(([, value]) => value > 0)
      .map(([key]) => key)
      .sort((a, b) => a - b);
    ctx.firstIncomeYm = incomeKeys[0] ?? null;
  }
  return contexts.filter((ctx) => ctx.balanceNow > 0 || ctx.firstIncomeYm !== null);
}

function sumAfter(values: Map<number, number>, afterYm: number): number {
  let total = 0;
  for (const [key, value] of Array.from(values.entries())) {
    if (key > afterYm) total += value;
  }
  return total;
}

export function closingBalance(ctx: BalanceContext, atYm: number): number {
  if (ctx.firstIncomeYm === null || atYm < ctx.firstIncomeYm) return 0;
  return Math.max(0, ctx.balanceNow - sumAfter(ctx.flowByYm, atYm) - sumAfter(ctx.incomeByYm, atYm));
}

// Rentabilidade do mês sobre o saldo de abertura + metade do fluxo do mês (aproximação de Dietz).
// O mês de estreia fica fora por ser parcial.
export function monthReturnPercent(contexts: BalanceContext[], atYm: number): number | null {
  let income = 0;
  let base = 0;
  for (const ctx of contexts) {
    if (ctx.firstIncomeYm === null || atYm <= ctx.firstIncomeYm) continue;
    income += ctx.incomeByYm.get(atYm) ?? 0;
    base += closingBalance(ctx, previousYm(atYm)) + (ctx.flowByYm.get(atYm) ?? 0) / 2;
  }
  return base > 0 ? (income / base) * 100 : null;
}

export function compoundPercents(percents: Array<number | null>): number | null {
  const valid = percents.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return (valid.reduce((acc, value) => acc * (1 + value / 100), 1) - 1) * 100;
}
