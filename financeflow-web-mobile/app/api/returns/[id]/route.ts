import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("id,investment_id,month,year,income_value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("monthly_returns").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
