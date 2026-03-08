import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../lib/supabase";
import { isMonthClosed } from "../../../lib/monthly-closures";

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
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json(
      { error: "Ano e mês são obrigatórios." },
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

  const { data, error } = await supabase
    .from("monthly_returns")
    .upsert(body, { onConflict: "investment_id,month,year" })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/returns");
  revalidatePath("/investments");
  return NextResponse.json(data, { status: 201 });
}
