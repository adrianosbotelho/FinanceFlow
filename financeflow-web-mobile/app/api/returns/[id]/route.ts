import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { rejectUntrustedOrigin } from "@/lib/origin-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const originError = rejectUntrustedOrigin(req);
  if (originError) return originError;

  const supabase = getSupabaseServerClient();
  const body = await req.json();
  const incomeValue = Number(body?.income_value);
  if (!Number.isFinite(incomeValue)) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("monthly_returns")
    .update({
      income_value: Math.round((incomeValue + Number.EPSILON) * 100) / 100,
    })
    .eq("id", params.id)
    .select("id,investment_id,month,year,income_value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Exclusao desabilitada no app web/mobile. Use apenas edicao de valores." },
    { status: 405 },
  );
}
