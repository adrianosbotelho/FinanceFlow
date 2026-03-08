import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";
import { isMonthClosed } from "../../../../lib/monthly-closures";

interface Params {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const { data: current, error: fetchError } = await supabase
    .from("monthly_returns")
    .select("year,month")
    .eq("id", params.id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Retorno não encontrado." },
      { status: 404 },
    );
  }

  const nextYear = Number(body?.year ?? current.year);
  const nextMonth = Number(body?.month ?? current.month);

  try {
    const [currentClosed, nextClosed] = await Promise.all([
      isMonthClosed(Number(current.year), Number(current.month)),
      isMonthClosed(nextYear, nextMonth),
    ]);
    if (currentClosed || nextClosed) {
      return NextResponse.json(
        { error: `O período ${nextMonth}/${nextYear} está fechado para edição.` },
        { status: 409 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao validar fechamento mensal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("monthly_returns")
    .update(body)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/returns");
  revalidatePath("/investments");
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { data: current, error: fetchError } = await supabase
    .from("monthly_returns")
    .select("year,month")
    .eq("id", params.id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Retorno não encontrado." },
      { status: 404 },
    );
  }

  try {
    const closed = await isMonthClosed(Number(current.year), Number(current.month));
    if (closed) {
      return NextResponse.json(
        { error: `O período ${current.month}/${current.year} está fechado para edição.` },
        { status: 409 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao validar fechamento mensal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error } = await supabase
    .from("monthly_returns")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/returns");
  revalidatePath("/investments");
  return NextResponse.json({ success: true });
}
