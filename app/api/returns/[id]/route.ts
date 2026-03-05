import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

interface Params {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const { data, error } = await supabase
    .from("monthly_returns")
    .update(body)
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
  const { error } = await supabase
    .from("monthly_returns")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
