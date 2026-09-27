import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mesmas regras do app desktop (lib/monthly-closures.ts e lib/monthly-return-revisions.ts):
// os dois apps gravam no mesmo banco, então precisam respeitar o fechamento mensal e a trilha
// de auditoria dos rendimentos.

export async function isMonthClosed(supabase: SupabaseClient, year: number, month: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("monthly_closures")
    .select("is_closed")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (error) {
    // Ambientes sem a tabela de fechamento tratam o mês como aberto (igual ao desktop).
    if (error.message?.includes("monthly_closures")) return false;
    throw new Error(error.message);
  }
  return Boolean(data?.is_closed);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function logMonthlyReturnRevision(
  supabase: SupabaseClient,
  input: {
    monthlyReturnId: string;
    investmentId: string;
    year: number;
    month: number;
    previousIncomeValue: number | null;
    newIncomeValue: number;
    action: "CREATE" | "UPDATE";
  },
): Promise<void> {
  const previous = input.previousIncomeValue === null ? null : roundCurrency(input.previousIncomeValue);
  const next = roundCurrency(input.newIncomeValue);
  const { error } = await supabase.from("monthly_return_revisions").insert({
    monthly_return_id: input.monthlyReturnId,
    investment_id: input.investmentId,
    year: input.year,
    month: input.month,
    previous_income_value: previous,
    new_income_value: next,
    delta_income_value: roundCurrency(next - (previous ?? 0)),
    action: input.action,
  });
  if (error) console.error("Falha ao gravar revisão de retorno mensal.", error);
}
