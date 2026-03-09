import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("investment_goals_annual") &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "year é obrigatório." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("investment_goals_annual")
    .select("*")
    .eq("year", year);

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_annual ainda não existe. Aplique o schema.sql para habilitar metas anuais.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const investmentId = String(body?.investment_id ?? "").trim();
  const year = Number(body?.year);
  const annualTarget = Number(body?.annual_target);

  if (!investmentId || !Number.isFinite(year)) {
    return NextResponse.json(
      { error: "investment_id e year são obrigatórios." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(annualTarget) || annualTarget < 0) {
    return NextResponse.json({ error: "annual_target inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("investment_goals_annual")
    .upsert(
      {
        investment_id: investmentId,
        year,
        annual_target: annualTarget,
      },
      { onConflict: "investment_id,year" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_annual ainda não existe. Aplique o schema.sql para habilitar metas anuais.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/goals");
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const investmentId = String(body?.investment_id ?? "").trim();
  const year = Number(body?.year);

  if (!investmentId || !Number.isFinite(year)) {
    return NextResponse.json(
      { error: "investment_id e year são obrigatórios." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("investment_goals_annual")
    .delete()
    .eq("investment_id", investmentId)
    .eq("year", year);

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_annual ainda não existe. Aplique o schema.sql para habilitar metas anuais.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/goals");
  return NextResponse.json({ success: true });
}
