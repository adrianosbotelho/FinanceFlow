// Cópia fiel de lib/income-balance.ts do app desktop (os projetos são isolados). Mantenha as duas versões iguais;
// os testes em financeflow-web-mobile/tests/ espelham os do desktop.
// Renda de CDB é reinvestida: ao lançar, corrigir ou excluir a renda de um mês, o saldo do
// investimento (investments.amount_invested) muda pela diferença. Função pura; a gravação fica em
// lib/income-balance-sync.ts. FIIs não entram (dividendos não aumentam a posição).

export type IncomeEntry = { investmentId: string; value: number } | null;

export type BalanceAdjustment = { investmentId: string; delta: number };

const EPSILON = 0.004;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Ajustes de saldo para uma alteração de lançamento: criação (antes null), exclusão (depois null),
 * mudança de valor ou troca de investimento (tira do antigo, soma no novo).
 */
export function incomeBalanceAdjustments(before: IncomeEntry, after: IncomeEntry): BalanceAdjustment[] {
  const deltas = new Map<string, number>();
  if (before) deltas.set(before.investmentId, (deltas.get(before.investmentId) ?? 0) - before.value);
  if (after) deltas.set(after.investmentId, (deltas.get(after.investmentId) ?? 0) + after.value);
  return Array.from(deltas.entries())
    .map(([investmentId, delta]) => ({ investmentId, delta: round2(delta) }))
    .filter((item) => Math.abs(item.delta) > EPSILON);
}

/** Novo saldo após o ajuste (nunca negativo). */
export function applyBalanceDelta(balance: number, delta: number): number {
  return round2(Math.max(0, balance + delta));
}
