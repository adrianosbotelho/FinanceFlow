import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

function toNumber(value: unknown): number {
  return Number(value);
}

function validatePeriod(year: number, month: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return "Ano e mês são obrigatórios.";
  }
  if (month < 1 || month > 12) {
    return "Mês inválido. Use valores entre 1 e 12.";
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");

  let query = supabase
    .from("monthly_closures")
    .select("*")
    .order("year")
    .order("month");

  if (yearParam) {
    query = query.eq("year", Number(yearParam));
  }

  const { data, error } = await query;
  if (error) {
    if (error.message?.includes("monthly_closures")) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const year = toNumber(body?.year);
  const month = toNumber(body?.month);
  const isClosed = Boolean(body?.is_closed);
  const validationError = validatePeriod(year, month);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const payload = {
    year,
    month,
    is_closed: isClosed,
    closed_at: isClosed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("monthly_closures")
    .upsert(payload, { onConflict: "year,month" })
    .select("*")
    .single();

  if (error) {
    if (error.message?.includes("monthly_closures")) {
      return NextResponse.json(
        {
          error:
            "A tabela monthly_closures ainda não existe no Supabase. Aplique o schema.sql para habilitar fechamento mensal.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
