import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { rejectUntrustedOrigin } from "@/lib/origin-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());

  const [{ data: investments, error: invError }, { data: returns, error: retError }] =
    await Promise.all([
      supabase.from("investments").select("id,type,institution,name"),
      supabase
        .from("monthly_returns")
        .select("id,investment_id,month,year,income_value")
        .eq("year", year)
        .order("month", { ascending: false })
        .order("investment_id"),
    ]);

  if (invError || retError || !investments || !returns) {
    return NextResponse.json(
      { error: (invError ?? retError)?.message ?? "Erro ao buscar retornos." },
      { status: 500 },
    );
  }

  const labelMap = new Map(
    investments.map((i) => [i.id, `${i.type} • ${i.institution} • ${i.name}`]),
  );

  const rows = returns.map((r) => ({
    ...r,
    investment_label: labelMap.get(r.investment_id) ?? r.investment_id,
  }));

  rows.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return a.investment_label.localeCompare(b.investment_label, "pt-BR");
  });

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function POST(req: NextRequest) {
  const originError = rejectUntrustedOrigin(req);
  if (originError) return originError;

  const supabase = getSupabaseServerClient();
  const body = await req.json();
  const investmentId = String(body?.investment_id ?? "");
  const month = Number(body?.month);
  const year = Number(body?.year);
  const incomeValue = Number(body?.income_value);

  if (!investmentId || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return NextResponse.json({ error: "Dados inválidos para lançamento." }, { status: 400 });
  }
  if (!Number.isFinite(incomeValue)) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  const payload = {
    investment_id: investmentId,
    month,
    year,
    income_value: Math.round((incomeValue + Number.EPSILON) * 100) / 100,
  };

  const { data, error } = await supabase
    .from("monthly_returns")
    .upsert(payload, { onConflict: "investment_id,month,year" })
    .select("id,investment_id,month,year,income_value")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
