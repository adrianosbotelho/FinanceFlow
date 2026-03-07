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
    throw new Error(error.message);
  }

  return Boolean(data?.is_closed);
}
