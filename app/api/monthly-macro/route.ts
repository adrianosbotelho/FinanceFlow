import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");

  let query = supabase.from("monthly_macro").select("*").order("year").order("month");
  if (year) query = query.eq("year", Number(year));

  const { data, error } = await query;
  if (error) {
    if (error.message?.includes("monthly_macro")) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const payload = {
    year: Number(body?.year),
    month: Number(body?.month),
    inflation_rate: Number(body?.inflation_rate ?? 0),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("monthly_macro")
    .upsert(payload, { onConflict: "year,month" })
    .select("*")
    .single();

  if (error) {
    if (error.message?.includes("monthly_macro")) {
      return NextResponse.json(
        {
          error:
            "A tabela monthly_macro ainda não existe no Supabase. Aplique o schema.sql para habilitar retorno real.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
