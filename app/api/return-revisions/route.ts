import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

function isMissingTableError(message: string | undefined, table: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const investmentId = searchParams.get("investment_id");

  let query = supabase
    .from("monthly_return_revisions")
    .select("*")
    .order("created_at", { ascending: false });

  if (year) query = query.eq("year", Number(year));
  if (investmentId && investmentId !== "all") query = query.eq("investment_id", investmentId);

  const { data, error } = await query.limit(500);
  if (error) {
    if (isMissingTableError(error.message, "monthly_return_revisions")) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(Array.isArray(data) ? data : []);
}
