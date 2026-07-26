import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("investments")
    .select("id,type,institution,name,amount_invested,cdi_rate,benchmark,start_date,liquidity,maturity_date")
    .order("type")
    .order("institution")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const body = await req.json();
  const { type, institution, name, amount_invested, cdi_rate, benchmark, start_date, liquidity, maturity_date } = body;

  if (!type || !institution || !name || amount_invested === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: type, institution, name, amount_invested" }, { status: 400 });
  }

  const payload: Record<string, unknown> = { type, institution, name, amount_invested: Number(amount_invested) };
  if (cdi_rate !== undefined && cdi_rate !== null && cdi_rate !== "") payload.cdi_rate = Number(cdi_rate);
  if (benchmark) payload.benchmark = benchmark;
  if (start_date) payload.start_date = start_date;
  if (liquidity) payload.liquidity = liquidity;
  if (maturity_date) payload.maturity_date = maturity_date;

  const { data, error } = await supabase.from("investments").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
