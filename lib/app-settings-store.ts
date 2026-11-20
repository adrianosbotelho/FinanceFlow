import "server-only";
// Leitura dos parâmetros da página Configurações no servidor. Sem a tabela (migration não aplicada) ou
// com erro no Supabase, valem os padrões de lib/app-settings.ts.
import { supabase } from "./supabase";
import { AppSettings, defaultAppSettings, resolveAppSettings } from "./app-settings";

export async function loadAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from("app_settings").select("key,value");
  if (error || !data) {
    if (error) console.warn("[FinanceFlow] Configurações indisponíveis, usando padrões:", error.message);
    return defaultAppSettings();
  }
  return resolveAppSettings(data as Array<{ key: string; value: unknown }>);
}
