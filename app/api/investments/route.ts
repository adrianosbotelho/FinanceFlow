import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { InvestmentType } from "../../../types";

function normalizePayload(body: any) {
  const type = body?.type as InvestmentType;
  const institution = String(body?.institution ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const amountInvested = Number(body?.amount_invested);

  if (type !== "CDB" && type !== "FII") {
    return { error: "Tipo inválido. Use CDB ou FII." };
  }
  if (!institution) {
    return { error: "Instituição é obrigatória." };
  }
  if (!name) {
    return { error: "Nome é obrigatório." };
  }
  if (!Number.isFinite(amountInvested) || amountInvested < 0) {
    return { error: "Valor investido inválido." };
  }
  return {
    data: {
      type,
      institution,
      name,
      amount_invested: amountInvested,
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as InvestmentType | null;

  let query = supabase
    .from("investments")
    .select("*")
    .order("type")
    .order("institution")
    .order("name");
  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = normalizePayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const payload = parsed.data;
  const { data: duplicate } = await supabase
    .from("investments")
    .select("id")
    .eq("type", payload.type)
    .ilike("institution", payload.institution)
    .ilike("name", payload.name)
    .maybeSingle();
  if (duplicate?.id) {
    return NextResponse.json(
      { error: "Investimento já cadastrado com esse tipo/instituição/nome." },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("investments")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
