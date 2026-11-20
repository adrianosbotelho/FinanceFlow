import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { loadAppSettings } from "../../../lib/app-settings-store";
import { AppSettingKey, isAppSettingKey, validateAppSettingValue } from "../../../lib/app-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET: parâmetros atuais (salvos ou padrão).
export async function GET() {
  const settings = await loadAppSettings();
  return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
}

// PUT { settings: { chave: valor } }: valida cada chave conhecida e grava só as colunas permitidas.
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const input = (body as { settings?: unknown })?.settings;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "Informe os parâmetros em settings." }, { status: 400 });
  }

  const rows: Array<{ key: AppSettingKey; value: number; updated_at: string }> = [];
  const updatedAt = new Date().toISOString();
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isAppSettingKey(key)) {
      return NextResponse.json({ error: `Parâmetro desconhecido: ${key}.` }, { status: 400 });
    }
    const checked = validateAppSettingValue(key, raw);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    rows.push({ key, value: checked.value, updated_at: updatedAt });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhum parâmetro para salvar." }, { status: 400 });
  }

  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) {
    console.error("[FinanceFlow] Falha ao salvar configurações:", error.message);
    return NextResponse.json({ error: "Não foi possível salvar as configurações." }, { status: 500 });
  }

  revalidatePath("/settings");
  revalidatePath("/performance");
  const settings = await loadAppSettings();
  return NextResponse.json({ settings });
}
