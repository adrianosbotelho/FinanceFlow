import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("investment_goals_monthly") &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json(
      { error: "year e month são obrigatórios." },
      { status: 400 },
    );
  }
  const { data, error } = await supabase
    .from("investment_goals_monthly")
    .select("*")
    .eq("year", year)
    .eq("month", month);

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_monthly ainda não existe. Aplique o schema.sql para habilitar metas por mês.",
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
  const month = Number(body?.month);
  const monthlyTarget = Number(body?.monthly_target);

  if (!investmentId || !Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json(
      { error: "investment_id, year e month são obrigatórios." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(monthlyTarget) || monthlyTarget < 0) {
    return NextResponse.json(
      { error: "monthly_target inválido." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("investment_goals_monthly")
    .upsert(
      {
        investment_id: investmentId,
        year,
        month,
        monthly_target: monthlyTarget,
      },
      { onConflict: "investment_id,year,month" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_monthly ainda não existe. Aplique o schema.sql para habilitar metas por mês.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/goals");
  revalidatePath("/");
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const investmentId = String(body?.investment_id ?? "").trim();
  const year = Number(body?.year);
  const month = Number(body?.month);
  if (!investmentId || !Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json(
      { error: "investment_id, year e month são obrigatórios." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("investment_goals_monthly")
    .delete()
    .eq("investment_id", investmentId)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_monthly ainda não existe. Aplique o schema.sql para habilitar metas por mês.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/goals");
  revalidatePath("/");
  return NextResponse.json({ success: true });
}
