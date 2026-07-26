import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CashEventType = "APORTE" | "RESGATE" | "IMPOSTO" | "TAXA";
const EVENT_TYPES: CashEventType[] = ["APORTE", "RESGATE", "IMPOSTO", "TAXA"];

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());

  const { data, error } = await supabase
    .from("investment_cash_events")
    .select("*")
    .eq("year", year)
    .order("event_date", { ascending: false });

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

  const { investment_id, event_date, type, amount, notes } = body;
  if (!investment_id || !event_date || !type || amount === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: investment_id, event_date, type, amount" }, { status: 400 });
  }
  if (!EVENT_TYPES.includes(type)) {
    return NextResponse.json({ error: `Tipo inválido. Use: ${EVENT_TYPES.join(", ")}` }, { status: 400 });
  }

  const match = String(event_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return NextResponse.json({ error: "event_date deve estar no formato YYYY-MM-DD" }, { status: 400 });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);

  const { data, error } = await supabase
    .from("investment_cash_events")
    .insert({
      investment_id,
      event_date,
      year,
      month,
      type,
      amount: Number(amount),
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Parâmetro id obrigatório" }, { status: 400 });
  }

  const { error } = await supabase.from("investment_cash_events").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
