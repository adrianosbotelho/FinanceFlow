import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);

  const [{ data: inv, error: invError }, { data: monthly, error: mError }, { data: annual, error: aError }] =
    await Promise.all([
      supabase.from("investments").select("id,type,institution,name"),
      supabase
        .from("investment_goals_monthly")
        .select("investment_id,year,month,monthly_target")
        .eq("year", year)
        .eq("month", month),
      supabase
        .from("investment_goals_annual")
        .select("investment_id,year,annual_target")
        .eq("year", year),
    ]);

  if (invError || mError || aError || !inv || !monthly || !annual) {
    return NextResponse.json(
      { error: (invError ?? mError ?? aError)?.message ?? "Erro ao buscar metas." },
      { status: 500 },
    );
  }

  const label = new Map(inv.map((i) => [i.id, `${i.type} • ${i.institution} • ${i.name}`]));

  const rows = [
    ...monthly.map((g) => ({
      investment_id: g.investment_id,
      investment_label: label.get(g.investment_id) ?? g.investment_id,
      year: g.year,
      month: g.month,
      target: Number(g.monthly_target ?? 0),
      type: "monthly" as const,
    })),
    ...annual.map((g) => ({
      investment_id: g.investment_id,
      investment_label: label.get(g.investment_id) ?? g.investment_id,
      year: g.year,
      month: null,
      target: Number(g.annual_target ?? 0),
      type: "annual" as const,
    })),
  ];

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
