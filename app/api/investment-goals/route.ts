import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingGoalsTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("investment_goals") &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

export async function GET() {
  const { data, error } = await supabase
    .from("investment_goals")
    .select("*")
    .order("investment_id");
  if (error) {
    if (isMissingGoalsTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals ainda não existe. Aplique o schema.sql para habilitar metas por investimento.",
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
  const monthlyTarget = Number(body?.monthly_target);

  if (!investmentId) {
    return NextResponse.json(
      { error: "investment_id é obrigatório." },
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
    .from("investment_goals")
    .upsert(
      {
        investment_id: investmentId,
        monthly_target: monthlyTarget,
      },
      { onConflict: "investment_id" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingGoalsTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals ainda não existe. Aplique o schema.sql para habilitar metas por investimento.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/goals");
  revalidatePath("/");
  revalidatePath("/returns");
  return NextResponse.json(data, { status: 201 });
}
