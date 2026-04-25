import { supabase } from "./supabase";

type LogRevisionInput = {
  monthlyReturnId: string;
  investmentId: string;
  year: number;
  month: number;
  previousIncomeValue: number | null;
  newIncomeValue: number;
  action: "CREATE" | "UPDATE";
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function logMonthlyReturnRevision(
  input: LogRevisionInput,
): Promise<void> {
  const previous = input.previousIncomeValue === null
    ? null
    : roundCurrency(input.previousIncomeValue);
  const next = roundCurrency(input.newIncomeValue);
  const delta = roundCurrency(next - (previous ?? 0));

  const { error } = await supabase.from("monthly_return_revisions").insert({
    monthly_return_id: input.monthlyReturnId,
    investment_id: input.investmentId,
    year: input.year,
    month: input.month,
    previous_income_value: previous,
    new_income_value: next,
    delta_income_value: delta,
    action: input.action,
  });

  if (error) {
    console.error("Falha ao gravar revisão de retorno mensal.", error);
  }
}
