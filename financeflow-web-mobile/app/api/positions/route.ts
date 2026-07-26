import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());

  const { data, error } = await supabase
    .from("monthly_positions")
    .select("*")
    .eq("year", year)
    .order("month");

  if (error) {
    if (error.message?.toLowerCase().includes("does not exist")) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const body = await req.json();
  const { investment_id, year, month, market_value, taxes_paid, fees_paid } = body;

  if (!investment_id || !year || !month || market_value === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: investment_id, year, month, market_value" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("monthly_positions")
    .upsert(
      {
        investment_id,
        year: Number(year),
        month: Number(month),
        market_value: Number(market_value),
        taxes_paid: Number(taxes_paid ?? 0),
        fees_paid: Number(fees_paid ?? 0),
      },
      { onConflict: "investment_id,year,month" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
