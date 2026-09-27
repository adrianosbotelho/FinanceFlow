import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { rejectUntrustedOrigin } from "@/lib/origin-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Mesma regra do desktop: aporte soma e resgate subtrai do valor aplicado (amount_invested).
function principalDelta(type: string, amount: number): number {
  if (type === "APORTE") return amount;
  if (type === "RESGATE") return -amount;
  return 0;
}

async function adjustPrincipal(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  investmentId: string,
  delta: number,
): Promise<string | null> {
  if (delta === 0) return null;
  const { data, error } = await supabase
    .from("investments")
    .select("amount_invested")
    .eq("id", investmentId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "Investimento não encontrado.";
  const next = roundCurrency(Math.max(0, Number(data.amount_invested ?? 0) + delta));
  const { error: updateError } = await supabase.from("investments").update({ amount_invested: next }).eq("id", investmentId);
  return updateError ? updateError.message : null;
}

export async function POST(req: NextRequest) {
  const originError = rejectUntrustedOrigin(req);
  if (originError) return originError;

  const supabase = getSupabaseServerClient();
  const body = await req.json().catch(() => null);

  const investmentId = String(body?.investment_id ?? "");
  const eventDate = String(body?.event_date ?? "");
  const type = String(body?.type ?? "").toUpperCase();
  const amount = Number(body?.amount);
  const notes = body?.notes ? String(body.notes).slice(0, 500) : null;
  if (!investmentId || !eventDate || !type || body?.amount === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: investment_id, event_date, type, amount" }, { status: 400 });
  }
  if (!EVENT_TYPES.includes(type as CashEventType)) {
    return NextResponse.json({ error: `Tipo inválido. Use: ${EVENT_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  const match = eventDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return NextResponse.json({ error: "event_date deve estar no formato YYYY-MM-DD" }, { status: 400 });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const normalizedAmount = roundCurrency(amount);

  const { data, error } = await supabase
    .from("investment_cash_events")
    .insert({
      investment_id: investmentId,
      event_date: eventDate,
      year,
      month,
      type,
      amount: normalizedAmount,
      notes,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const principalError = await adjustPrincipal(supabase, investmentId, principalDelta(type, normalizedAmount));
  if (principalError) {
    // Desfaz o evento para não deixar evento e saldo inconsistentes (igual ao desktop).
    await supabase.from("investment_cash_events").delete().eq("id", data.id);
    return NextResponse.json({ error: `Falha ao atualizar o saldo: ${principalError}` }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const originError = rejectUntrustedOrigin(req);
  if (originError) return originError;

  const supabase = getSupabaseServerClient();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Parâmetro id obrigatório" }, { status: 400 });
  }

  const { data: event, error: readError } = await supabase
    .from("investment_cash_events")
    .select("id,investment_id,type,amount")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });

  const { error } = await supabase.from("investment_cash_events").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Excluir um aporte/resgate reverte o efeito no saldo (igual ao desktop).
  const principalError = await adjustPrincipal(
    supabase,
    String(event.investment_id),
    -principalDelta(String(event.type), Number(event.amount ?? 0)),
  );
  if (principalError) {
    return NextResponse.json({ error: `Evento excluído, mas o saldo não foi revertido: ${principalError}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
