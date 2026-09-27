import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";
import { buildImportPreview, isImportFormat, isImportKind } from "../../../../lib/import-service";
import { logMonthlyReturnRevision } from "../../../../lib/monthly-return-revisions";
import { ImportCommitPayload } from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REVALIDATED_PATHS = ["/", "/returns", "/investments", "/goals", "/performance", "/history-performance", "/liquidity", "/insights"];

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const format = body?.format;
  const content = typeof body?.content === "string" ? body.content : "";
  const investmentId = typeof body?.investment_id === "string" && body.investment_id ? body.investment_id : null;
  const lines = Array.isArray(body?.lines) ? new Set(body.lines.map(Number).filter(Number.isInteger)) : null;
  const adjustBalance = body?.adjust_balance === true;
  if (!isImportKind(kind)) return NextResponse.json({ error: "Tipo de importação inválido." }, { status: 400 });
  if (!isImportFormat(format)) return NextResponse.json({ error: "Formato inválido (use CSV ou OFX)." }, { status: 400 });
  if (!content.trim()) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  if (!lines || lines.size === 0) return NextResponse.json({ error: "Nenhuma linha selecionada." }, { status: 400 });

  try {
    // Revalida o arquivo no servidor; grava só as linhas selecionadas que continuam importáveis.
    const preview = await buildImportPreview({ kind, format, content, investmentId });
    if (preview.error) return NextResponse.json({ error: preview.error }, { status: 400 });
    const selected = preview.rows.filter((row) => row.importable && lines.has(row.line));
    const result: ImportCommitPayload = {
      created: 0,
      updated: 0,
      skipped: lines.size - selected.length,
      balanceAdjusted: false,
    };

    if (kind === "returns") {
      for (const row of selected) {
        const { data, error } = await supabase
          .from("monthly_returns")
          .upsert(
            { investment_id: row.investmentId, year: row.year, month: row.month, income_value: row.value },
            { onConflict: "investment_id,month,year" },
          )
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        await logMonthlyReturnRevision({
          monthlyReturnId: String(data.id),
          investmentId: row.investmentId!,
          year: row.year!,
          month: row.month!,
          previousIncomeValue: row.status === "atualiza" ? row.previousValue : null,
          newIncomeValue: row.value!,
          action: row.status === "atualiza" ? "UPDATE" : "CREATE",
        });
        if (row.status === "atualiza") result.updated += 1;
        else result.created += 1;
      }
    } else if (selected.length > 0) {
      const { error } = await supabase.from("investment_cash_events").insert(
        selected.map((row) => ({
          investment_id: row.investmentId,
          event_date: row.date,
          year: row.year,
          month: row.month,
          type: row.type,
          amount: row.value,
          notes: `Importado (${format.toUpperCase()})${row.description ? `: ${row.description.slice(0, 120)}` : ""}`,
        })),
      );
      if (error) throw new Error(error.message);
      result.created = selected.length;

      // Opcional: somar ao saldo aportes/resgates que ainda não estão no valor aplicado.
      if (adjustBalance) {
        const deltaById = new Map<string, number>();
        for (const row of selected) {
          const delta = row.type === "APORTE" ? row.value! : row.type === "RESGATE" ? -row.value! : 0;
          deltaById.set(row.investmentId!, (deltaById.get(row.investmentId!) ?? 0) + delta);
        }
        for (const [id, delta] of Array.from(deltaById.entries())) {
          if (delta === 0) continue;
          const { data, error: readError } = await supabase
            .from("investments")
            .select("amount_invested")
            .eq("id", id)
            .single();
          if (readError) throw new Error(readError.message);
          const { error: updateError } = await supabase
            .from("investments")
            .update({ amount_invested: roundCurrency(Math.max(0, Number(data.amount_invested ?? 0) + delta)) })
            .eq("id", id);
          if (updateError) throw new Error(updateError.message);
        }
        result.balanceAdjusted = true;
      }
    }

    for (const path of REVALIDATED_PATHS) revalidatePath(path);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gravar a importação.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
