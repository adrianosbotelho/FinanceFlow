import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);

  const [
    { data: inv, error: invError },
    { data: monthly, error: mError },
    { data: annual, error: aError },
    { data: returns, error: returnsError },
  ] =
    await Promise.all([
      supabase.from("investments").select("id,type,institution,name,amount_invested"),
      supabase
        .from("investment_goals_monthly")
        .select("investment_id,year,month,monthly_target")
        .eq("year", year)
        .eq("month", month),
      supabase
        .from("investment_goals_annual")
        .select("investment_id,year,annual_target")
        .eq("year", year),
      supabase
        .from("monthly_returns")
        .select("investment_id,income_value")
        .eq("year", year)
        .eq("month", month),
    ]);

  if (invError || mError || aError || returnsError || !inv || !monthly || !annual || !returns) {
    return NextResponse.json(
      { error: (invError ?? mError ?? aError ?? returnsError)?.message ?? "Erro ao buscar metas." },
      { status: 500 },
    );
  }

  const label = new Map(inv.map((i) => [i.id, `${i.type} • ${i.institution} • ${i.name}`]));
  const investedByInvestment = new Map(inv.map((i) => [i.id, Number(i.amount_invested ?? 0)]));
  const realizedMonthlyByInvestment = new Map<string, number>();
  for (const row of returns) {
    const current = realizedMonthlyByInvestment.get(row.investment_id) ?? 0;
    realizedMonthlyByInvestment.set(row.investment_id, current + Number(row.income_value ?? 0));
  }

  const rows = [
    ...monthly.map((g) => ({
      target: Number(g.monthly_target ?? 0),
      current: Number(realizedMonthlyByInvestment.get(g.investment_id) ?? 0),
      type: "monthly" as const,
      investment_id: g.investment_id,
      investment_label: label.get(g.investment_id) ?? g.investment_id,
      year: g.year,
      month: g.month,
    })),
    ...annual.map((g) => ({
      target: Number(g.annual_target ?? 0),
      current: Number(investedByInvestment.get(g.investment_id) ?? 0),
      type: "annual" as const,
      investment_id: g.investment_id,
      investment_label: label.get(g.investment_id) ?? g.investment_id,
      year: g.year,
      month: null,
    })),
  ].map((row) => {
    const progress = row.target > 0 ? (row.current / row.target) * 100 : null;
    return {
      investment_id: row.investment_id,
      investment_label: row.investment_label,
      year: row.year,
      month: row.month,
      target: row.target,
      current_value: row.current,
      progress_pct: progress,
      gap_value: row.target > 0 ? Math.max(row.target - row.current, 0) : null,
      type: row.type,
    };
  });

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
