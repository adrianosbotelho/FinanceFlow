import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient();
  const body = await req.json();
  const { type, institution, name, amount_invested, cdi_rate, benchmark, start_date, liquidity, maturity_date } = body;

  const payload: Record<string, unknown> = {};
  if (type !== undefined) payload.type = type;
  if (institution !== undefined) payload.institution = institution;
  if (name !== undefined) payload.name = name;
  if (amount_invested !== undefined) payload.amount_invested = Number(amount_invested);
  if (cdi_rate !== undefined) payload.cdi_rate = cdi_rate === null || cdi_rate === "" ? null : Number(cdi_rate);
  if (benchmark !== undefined) payload.benchmark = benchmark || null;
  if (start_date !== undefined) payload.start_date = start_date || null;
  if (liquidity !== undefined) payload.liquidity = liquidity || null;
  if (maturity_date !== undefined) payload.maturity_date = maturity_date || null;

  const { data, error } = await supabase
    .from("investments")
    .update(payload)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("investments").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
