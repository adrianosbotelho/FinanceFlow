import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";

interface Params {
  params: { investmentId: string };
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const investmentId = String(params.investmentId ?? "").trim();
  if (!investmentId) {
    return NextResponse.json(
      { error: "investmentId inválido." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("investment_goals")
    .delete()
    .eq("investment_id", investmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/goals");
  revalidatePath("/");
  revalidatePath("/returns");
  return NextResponse.json({ success: true });
}
