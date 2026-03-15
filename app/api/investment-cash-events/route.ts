import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../lib/supabase";
import { CashEventType, InvestmentCashEvent } from "../../../types";

const EVENT_TYPES: CashEventType[] = ["APORTE", "RESGATE", "IMPOSTO", "TAXA"];

function isMissingTableError(message: string | undefined, table: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function principalDeltaFromEvent(type: CashEventType, amount: number): number {
  if (type === "APORTE") return amount;
  if (type === "RESGATE") return -amount;
  return 0;
}

function affectsPrincipal(type: CashEventType): boolean {
  return type === "APORTE" || type === "RESGATE";
}

async function getInvestmentPrincipal(investmentId: string): Promise<
  | { ok: true; principal: number }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await supabase
    .from("investments")
    .select("id,amount_invested")
    .eq("id", investmentId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Investimento não encontrado." };
  }
  return { ok: true, principal: Number(data.amount_invested ?? 0) };
}

async function updateInvestmentPrincipal(investmentId: string, amountInvested: number) {
  return supabase
    .from("investments")
    .update({ amount_invested: roundCurrency(Math.max(0, amountInvested)) })
    .eq("id", investmentId);
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
    if (isMissingTableError(error.message, "investment_cash_events")) {
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

  const normalizedAmount = roundCurrency(amount);
  const delta = principalDeltaFromEvent(type, normalizedAmount);

  let nextPrincipal = 0;
  if (affectsPrincipal(type)) {
    const principalLookup = await getInvestmentPrincipal(investmentId);
    if (!principalLookup.ok) {
      return NextResponse.json(
        { error: principalLookup.error },
        { status: principalLookup.status },
      );
    }
    const currentPrincipal = principalLookup.principal;
    const nextPrincipalRaw = currentPrincipal + delta;
    if (nextPrincipalRaw < -0.0001) {
      return NextResponse.json(
        {
          error:
            "Resgate excede o capital investido atual deste lançamento. Revise valor/data do evento.",
        },
        { status: 409 },
      );
    }
    nextPrincipal = roundCurrency(Math.max(0, nextPrincipalRaw));
  }

  const payload = {
    investment_id: investmentId,
    event_date: eventDate.iso,
    year: eventDate.year,
    month: eventDate.month,
    type,
    amount: normalizedAmount,
    notes: body?.notes ? String(body.notes) : null,
    updated_at: new Date().toISOString(),
  };

  const { data: createdEvent, error: createError } = await supabase
    .from("investment_cash_events")
    .insert(payload)
    .select("*")
    .single();

  if (createError) {
    if (isMissingTableError(createError.message, "investment_cash_events")) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_cash_events ainda não existe no Supabase. Aplique o schema.sql/migration para habilitar eventos.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  if (affectsPrincipal(type)) {
    const { error: principalUpdateError } = await updateInvestmentPrincipal(
      investmentId,
      nextPrincipal,
    );
    if (principalUpdateError) {
      // Rollback best-effort do evento para evitar divergência.
      await supabase.from("investment_cash_events").delete().eq("id", createdEvent.id);
      return NextResponse.json(
        {
          error:
            "Evento não foi aplicado: falha ao atualizar o capital investido. Tente novamente.",
        },
        { status: 500 },
      );
    }
  }

  revalidatePath("/investments");
  revalidatePath("/returns");
  revalidatePath("/performance");
  revalidatePath("/");

  return NextResponse.json(createdEvent, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  }

  const { data: eventRow, error: eventLookupError } = await supabase
    .from("investment_cash_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (eventLookupError) {
    if (isMissingTableError(eventLookupError.message, "investment_cash_events")) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_cash_events ainda não existe no Supabase. Aplique o schema.sql/migration para habilitar eventos.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: eventLookupError.message }, { status: 500 });
  }

  if (!eventRow) {
    return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  }

  const event = eventRow as InvestmentCashEvent;
  const amount = roundCurrency(Number(event.amount ?? 0));
  const delta = principalDeltaFromEvent(event.type, amount);

  let revertedPrincipal = 0;
  if (affectsPrincipal(event.type)) {
    const principalLookup = await getInvestmentPrincipal(event.investment_id);
    if (!principalLookup.ok) {
      return NextResponse.json(
        { error: principalLookup.error },
        { status: principalLookup.status },
      );
    }
    // Ao excluir, desfazemos o impacto do evento.
    revertedPrincipal = roundCurrency(Math.max(0, principalLookup.principal - delta));
  }

  const { error: deleteError } = await supabase
    .from("investment_cash_events")
    .delete()
    .eq("id", id);
  if (deleteError) {
    if (isMissingTableError(deleteError.message, "investment_cash_events")) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_cash_events ainda não existe no Supabase. Aplique o schema.sql/migration para habilitar eventos.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (affectsPrincipal(event.type)) {
    const { error: principalUpdateError } = await updateInvestmentPrincipal(
      event.investment_id,
      revertedPrincipal,
    );
    if (principalUpdateError) {
      await supabase.from("investment_cash_events").insert({
        ...event,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          error:
            "Falha ao reverter capital investido após excluir evento. Operação revertida.",
        },
        { status: 500 },
      );
    }
  }

  revalidatePath("/investments");
  revalidatePath("/returns");
  revalidatePath("/performance");
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
