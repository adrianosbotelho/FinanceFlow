import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";
import { normalizeInvestmentPayload } from "../../../../lib/investment-payload";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Params {
  params: { id: string };
}


export async function PUT(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const parsed = normalizeInvestmentPayload(body);
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

  revalidatePath("/");
  revalidatePath("/investments");
  revalidatePath("/returns");
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabase.from("investments").delete().eq("id", params.id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath("/");
  revalidatePath("/investments");
  revalidatePath("/returns");
  return NextResponse.json({ success: true });
}
