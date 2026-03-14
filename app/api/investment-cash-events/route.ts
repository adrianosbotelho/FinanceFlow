import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { CashEventType } from "../../../types";

const EVENT_TYPES: CashEventType[] = ["APORTE", "RESGATE", "IMPOSTO", "TAXA"];

function parseEventDate(raw: unknown): { iso: string; year: number; month: number } | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { iso: raw, year, month };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const investmentId = searchParams.get("investment_id");

  let query = supabase
    .from("investment_cash_events")
    .select("*")
    .order("event_date", { ascending: true });

  if (year) {
    query = query.eq("year", Number(year));
  }
  if (investmentId) {
    query = query.eq("investment_id", investmentId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.message?.includes("investment_cash_events")) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const eventDate = parseEventDate(body?.event_date);
  const type = String(body?.type ?? "").toUpperCase() as CashEventType;
  const amount = Number(body?.amount ?? 0);
  const investmentId = String(body?.investment_id ?? "");

  if (!eventDate) {
    return NextResponse.json({ error: "event_date inválido." }, { status: 400 });
  }
  if (!EVENT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Tipo de evento inválido." }, { status: 400 });
  }
  if (!investmentId) {
    return NextResponse.json({ error: "investment_id é obrigatório." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount inválido." }, { status: 400 });
  }

  const payload = {
    investment_id: investmentId,
    event_date: eventDate.iso,
    year: eventDate.year,
    month: eventDate.month,
    type,
    amount,
    notes: body?.notes ? String(body.notes) : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("investment_cash_events")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (error.message?.includes("investment_cash_events")) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_cash_events ainda não existe no Supabase. Aplique o schema.sql/migration para habilitar eventos.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  }

  const { error } = await supabase.from("investment_cash_events").delete().eq("id", id);
  if (error) {
    if (error.message?.includes("investment_cash_events")) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_cash_events ainda não existe no Supabase. Aplique o schema.sql/migration para habilitar eventos.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
