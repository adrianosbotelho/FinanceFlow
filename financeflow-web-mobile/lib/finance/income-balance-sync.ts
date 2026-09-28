// Mesma lógica de lib/income-balance-sync.ts do app desktop, recebendo o cliente Supabase do mobile.
// Grava no saldo (investments.amount_invested) os ajustes de income-balance.ts. Só CDBs:
// a renda de FIIs não altera a posição. Falhas viram aviso; o lançamento da renda já foi salvo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { BalanceAdjustment, applyBalanceDelta } from "./income-balance";

export type AppliedBalanceAdjustment = BalanceAdjustment & { balance: number };

export async function applyIncomeBalanceAdjustments(
  supabase: SupabaseClient,
  adjustments: BalanceAdjustment[],
): Promise<{ applied: AppliedBalanceAdjustment[]; warnings: string[] }> {
  const applied: AppliedBalanceAdjustment[] = [];
  const warnings: string[] = [];
  for (const adjustment of adjustments) {
    const { data, error } = await supabase
      .from("investments")
      .select("id,type,amount_invested")
      .eq("id", adjustment.investmentId)
      .maybeSingle();
    if (error || !data) {
      warnings.push("Saldo do investimento não foi atualizado (investimento não encontrado).");
      continue;
    }
    if (String(data.type) !== "CDB") continue;
    const balance = applyBalanceDelta(Number(data.amount_invested ?? 0), adjustment.delta);
    const { error: updateError } = await supabase
      .from("investments")
      .update({ amount_invested: balance })
      .eq("id", adjustment.investmentId);
    if (updateError) {
      console.error(updateError);
      warnings.push("Saldo do investimento não foi atualizado; ajuste em Investimentos.");
      continue;
    }
    applied.push({ ...adjustment, balance });
  }
  return { applied, warnings };
}
