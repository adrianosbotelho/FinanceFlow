import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { rejectUntrustedOrigin } from "@/lib/origin-guard";
import { isMonthClosed, logMonthlyReturnRevision } from "@/lib/month-rules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const originError = rejectUntrustedOrigin(req);
  if (originError) return originError;

  const supabase = getSupabaseServerClient();
  const body = await req.json().catch(() => null);
  const incomeValue = Number(body?.income_value);
  if (!Number.isFinite(incomeValue) || incomeValue < 0) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  const { data: current, error: currentError } = await supabase
    .from("monthly_returns")
    .select("id,investment_id,year,month,income_value")
    .eq("id", params.id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Retorno não encontrado." }, { status: 404 });

  try {
    if (await isMonthClosed(supabase, Number(current.year), Number(current.month))) {
      return NextResponse.json(
        { error: `O período ${current.month}/${current.year} está fechado para edição.` },
        { status: 409 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao validar fechamento mensal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("monthly_returns")
    .update({
      income_value: Math.round((incomeValue + Number.EPSILON) * 100) / 100,
    })
    .eq("id", params.id)
    .select("id,investment_id,month,year,income_value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const previousValue = Number(current.income_value ?? 0);
  const nextValue = Number(data.income_value ?? 0);
  if (Math.abs(nextValue - previousValue) > 0.0001) {
    await logMonthlyReturnRevision(supabase, {
      monthlyReturnId: String(data.id),
      investmentId: String(data.investment_id),
      year: Number(data.year),
      month: Number(data.month),
      previousIncomeValue: previousValue,
      newIncomeValue: nextValue,
      action: "UPDATE",
    });
  }
  return NextResponse.json(data);
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Exclusao desabilitada no app web/mobile. Use apenas edicao de valores." },
    { status: 405 },
  );
}
