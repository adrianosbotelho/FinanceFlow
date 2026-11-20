import "server-only";
// Aparelhos confiáveis (tabela trusted_devices): cada aparelho que passou pelo código de verificação.
// Revogar um aparelho faz o próximo login nele pedir o código de novo.
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase";

export interface TrustedDevice {
  id: string;
  label: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export function isTwoFactorEnabled(): boolean {
  return Boolean(process.env.AUTH_TOTP_SECRET);
}

export async function registerTrustedDevice(label: string): Promise<string> {
  const id = randomUUID();
  const { error } = await getSupabaseServerClient().from("trusted_devices").insert({ id, label });
  if (error) throw new Error(error.message);
  return id;
}

/** O aparelho existe e não foi revogado; atualiza o último acesso. */
export async function isTrustedDeviceActive(id: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("trusted_devices")
    .select("id")
    .eq("id", id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return false;
  await supabase.from("trusted_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
  return true;
}

export async function listTrustedDevices(): Promise<TrustedDevice[]> {
  const { data, error } = await getSupabaseServerClient()
    .from("trusted_devices")
    .select("id,label,created_at,last_seen_at,revoked_at")
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrustedDevice[];
}

export async function revokeTrustedDevice(id: string): Promise<void> {
  const { error } = await getSupabaseServerClient()
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
