import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const investmentId = searchParams.get("investment_id");

  let query = supabase
    .from("monthly_positions")
    .select("*")
    .order("year")
    .order("month");

  if (year) query = query.eq("year", Number(year));
  if (investmentId) query = query.eq("investment_id", investmentId);

  const { data, error } = await query;
  if (error) {
    if (error.message?.includes("monthly_positions")) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const payload = {
    investment_id: body?.investment_id,
    year: Number(body?.year),
    month: Number(body?.month),
    market_value: Number(body?.market_value ?? 0),
    taxes_paid: Number(body?.taxes_paid ?? 0),
    fees_paid: Number(body?.fees_paid ?? 0),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("monthly_positions")
    .upsert(payload, { onConflict: "investment_id,year,month" })
    .select("*")
    .single();

  if (error) {
    if (error.message?.includes("monthly_positions")) {
      return NextResponse.json(
        {
          error:
            "A tabela monthly_positions ainda não existe no Supabase. Aplique o schema.sql para habilitar performance.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
