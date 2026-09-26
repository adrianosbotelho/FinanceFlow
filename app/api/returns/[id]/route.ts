import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";
import { isMonthClosed } from "../../../../lib/monthly-closures";
import { logMonthlyReturnRevision } from "../../../../lib/monthly-return-revisions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Params {
  params: { id: string };
}

type ReturnPatch = {
  investment_id?: string;
  year?: number;
  month?: number;
  income_value?: number;
};

// Monta a alteração só com as colunas permitidas, validando cada uma.
function buildReturnPatch(body: unknown): { patch: ReturnPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Corpo da requisição inválido." };
  const input = body as Record<string, unknown>;
  const patch: ReturnPatch = {};

  if (input.investment_id !== undefined) {
    const investmentId = String(input.investment_id ?? "").trim();
    if (!investmentId) return { error: "investment_id inválido." };
    patch.investment_id = investmentId;
  }
  if (input.year !== undefined) {
    const year = Number(input.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Ano inválido." };
    patch.year = year;
  }
  if (input.month !== undefined) {
    const month = Number(input.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Mês inválido." };
    patch.month = month;
  }
  if (input.income_value !== undefined) {
    const incomeValue = Number(input.income_value);
    if (!Number.isFinite(incomeValue) || incomeValue < 0) return { error: "income_value inválido." };
    patch.income_value = Math.round(incomeValue * 100) / 100;
  }

  if (Object.keys(patch).length === 0) return { error: "Nenhum campo válido para atualizar." };
  return { patch };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => null);
  const parsed = buildReturnPatch(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { patch } = parsed;
  const { data: current, error: fetchError } = await supabase
    .from("monthly_returns")
    .select("id,investment_id,year,month,income_value")
    .eq("id", params.id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Retorno não encontrado." }, { status: 404 });
  }

  const nextYear = patch.year ?? Number(current.year);
  const nextMonth = patch.month ?? Number(current.month);

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
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const previousValue = Number(current.income_value ?? 0);
  const nextValue = Number(data.income_value ?? 0);
  if (Math.abs(nextValue - previousValue) > 0.0001) {
    await logMonthlyReturnRevision({
      monthlyReturnId: String(data.id),
      investmentId: String(data.investment_id),
      year: Number(data.year),
      month: Number(data.month),
      previousIncomeValue: previousValue,
      newIncomeValue: nextValue,
      action: "UPDATE",
    });
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
    return NextResponse.json({ error: "Retorno não encontrado." }, { status: 404 });
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
