import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("investment_goals_monthly") &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const fromYear = Number(body?.fromYear);
  const fromMonth = Number(body?.fromMonth);
  const toYear = Number(body?.toYear);
  const toMonth = Number(body?.toMonth);

  if (
    !Number.isFinite(fromYear) ||
    !Number.isFinite(fromMonth) ||
    !Number.isFinite(toYear) ||
    !Number.isFinite(toMonth)
  ) {
    return NextResponse.json(
      { error: "fromYear, fromMonth, toYear e toMonth são obrigatórios." },
      { status: 400 },
    );
  }

  const { data: source, error: sourceError } = await supabase
    .from("investment_goals_monthly")
    .select("investment_id,monthly_target")
    .eq("year", fromYear)
    .eq("month", fromMonth);

  if (sourceError) {
    if (isMissingTableError(sourceError.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_monthly ainda não existe. Aplique o schema.sql para habilitar metas por mês.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: sourceError.message }, { status: 500 });
  }

  if (!source || source.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma meta encontrada no mês de origem para repetir." },
      { status: 404 },
    );
  }

  const payload = source.map((row) => ({
    investment_id: row.investment_id,
    year: toYear,
    month: toMonth,
    monthly_target: Number(row.monthly_target ?? 0),
  }));

  const { error: upsertError } = await supabase
    .from("investment_goals_monthly")
    .upsert(payload, { onConflict: "investment_id,year,month" });

  if (upsertError) {
    if (isMissingTableError(upsertError.message)) {
      return NextResponse.json(
        {
          error:
            "A tabela investment_goals_monthly ainda não existe. Aplique o schema.sql para habilitar metas por mês.",
        },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  revalidatePath("/goals");
  revalidatePath("/");
  return NextResponse.json({ success: true, copied: payload.length });
}
