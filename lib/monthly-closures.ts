import { supabase } from "./supabase";

export function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

export async function isMonthClosed(year: number, month: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("monthly_closures")
    .select("is_closed")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) {
    // Fallback para ambientes ainda sem migration de monthly_closures aplicada.
    if (error.message?.includes("monthly_closures")) {
      console.warn(
        "[FinanceFlow] monthly_closures table not available; treating month as open.",
      );
      return false;
    }
    throw new Error(error.message);
  }

  return Boolean(data?.is_closed);
}
