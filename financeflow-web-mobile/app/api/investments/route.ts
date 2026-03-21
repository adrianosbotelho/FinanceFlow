import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("investments")
    .select("id,type,institution,name,amount_invested")
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
