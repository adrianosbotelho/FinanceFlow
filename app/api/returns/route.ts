import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../lib/supabase";
import { isMonthClosed } from "../../../lib/monthly-closures";
import { logMonthlyReturnRevision } from "../../../lib/monthly-return-revisions";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const investmentId = searchParams.get("investment_id");

  let query = supabase
    .from("monthly_returns")
    .select("*")
    .order("year")
    .order("month");

  if (year) query = query.eq("year", Number(year));
  if (investmentId) query = query.eq("investment_id", investmentId);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const year = Number(body?.year);
  const month = Number(body?.month);
  const investmentId = String(body?.investment_id ?? "");
  const incomeValue = Number(body?.income_value);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json(
      { error: "Ano e mês são obrigatórios." },
      { status: 400 },
    );
  }
  if (!investmentId) {
    return NextResponse.json(
      { error: "investment_id é obrigatório." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(incomeValue) || incomeValue < 0) {
    return NextResponse.json(
      { error: "income_value inválido." },
      { status: 400 },
    );
  }

  try {
    const closed = await isMonthClosed(year, month);
    if (closed) {
      return NextResponse.json(
        { error: `O período ${month}/${year} está fechado para edição.` },
        { status: 409 },
      );
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

  const previousValue = previousRow ? Number(previousRow.income_value ?? 0) : null;

  const { data, error } = await supabase
    .from("monthly_returns")
    .upsert(body, { onConflict: "investment_id,month,year" })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextValue = Number(data.income_value ?? 0);
  const action = previousRow ? "UPDATE" : "CREATE";
  const valueChanged = previousValue === null || Math.abs(nextValue - previousValue) > 0.0001;
  if (valueChanged) {
    await logMonthlyReturnRevision({
      monthlyReturnId: String(data.id),
      investmentId: String(data.investment_id),
      year: Number(data.year),
      month: Number(data.month),
      previousIncomeValue: previousValue,
      newIncomeValue: nextValue,
      action,
    });
  }

  revalidatePath("/");
  revalidatePath("/returns");
  revalidatePath("/investments");
  return NextResponse.json(data, { status: 201 });
}
