import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { InvestmentType } from "../../../../types";

interface Params {
  params: { id: string };
}

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

export async function PUT(req: NextRequest, { params }: Params) {
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
    .neq("id", params.id)
    .maybeSingle();
  if (duplicate?.id) {
    return NextResponse.json(
      { error: "Já existe outro investimento com esse tipo/instituição/nome." },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("investments")
    .update(payload)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabase.from("investments").delete().eq("id", params.id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
