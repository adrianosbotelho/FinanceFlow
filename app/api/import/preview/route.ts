import { NextRequest, NextResponse } from "next/server";
import { buildImportPreview, isImportFormat, isImportKind } from "../../../../lib/import-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const format = body?.format;
  const content = typeof body?.content === "string" ? body.content : "";
  const investmentId = typeof body?.investment_id === "string" && body.investment_id ? body.investment_id : null;
  if (!isImportKind(kind)) return NextResponse.json({ error: "Tipo de importação inválido." }, { status: 400 });
  if (!isImportFormat(format)) return NextResponse.json({ error: "Formato inválido (use CSV ou OFX)." }, { status: 400 });
  if (!content.trim()) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });

  try {
    const preview = await buildImportPreview({ kind, format, content, investmentId });
    return NextResponse.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao ler o arquivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
