import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { rejectUntrustedOrigin } from "@/lib/origin-guard";
import { isMonthClosed, logMonthlyReturnRevision } from "@/lib/month-rules";
import { incomeBalanceAdjustments } from "@/lib/finance/income-balance";
import { applyIncomeBalanceAdjustments } from "@/lib/finance/income-balance-sync";

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
  const body = await req.json().catch(() => null);
  const investmentId = String(body?.investment_id ?? "");
  const month = Number(body?.month);
  const year = Number(body?.year);
  const incomeValue = Number(body?.income_value);

  if (!investmentId || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return NextResponse.json({ error: "Dados inválidos para lançamento." }, { status: 400 });
  }
  if (!Number.isFinite(incomeValue) || incomeValue < 0) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  try {
    if (await isMonthClosed(supabase, year, month)) {
      return NextResponse.json({ error: `O período ${month}/${year} está fechado para edição.` }, { status: 409 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao validar fechamento mensal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: previousRow } = await supabase
    .from("monthly_returns")
    .select("id,income_value")
    .eq("investment_id", investmentId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

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

  // Trilha de auditoria (mesma regra do desktop): só registra quando o valor muda.
  const previousValue = previousRow ? Number(previousRow.income_value ?? 0) : null;
  const nextValue = Number(data.income_value ?? 0);
  if (previousValue === null || Math.abs(nextValue - previousValue) > 0.0001) {
    await logMonthlyReturnRevision(supabase, {
      monthlyReturnId: String(data.id),
      investmentId,
      year,
      month,
      previousIncomeValue: previousValue,
      newIncomeValue: nextValue,
      action: previousRow ? "UPDATE" : "CREATE",
    });
  }

  // Renda de CDB é reinvestida: o saldo acompanha a diferença do acumulado (mesma regra do desktop).
  const balance = await applyIncomeBalanceAdjustments(
    supabase,
    incomeBalanceAdjustments(
      previousValue === null ? null : { investmentId, value: previousValue },
      { investmentId, value: nextValue },
    ),
  );

  return NextResponse.json(
    { ...data, balance_adjustments: balance.applied, warnings: balance.warnings },
    { status: 201 },
  );
}
