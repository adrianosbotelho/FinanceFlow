"use client";

// Aparelhos confiáveis: os que já passaram pelo código de verificação. Revogar faz o próximo login
// naquele aparelho pedir o código de novo.
import { useCallback, useEffect, useState } from "react";

type Device = {
  id: string;
  label: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function DevicesClient() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar.");
      setDevices(body.devices);
      setEnabled(body.twoFactorEnabled);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(device: Device) {
    const message = device.current
      ? "Revogar este aparelho? No próximo login aqui o código será pedido de novo."
      : `Revogar "${device.label}"? No próximo login nele o código será pedido de novo.`;
    if (!window.confirm(message)) return;
    setBusy(device.id);
    try {
      const res = await fetch(`/api/devices?id=${encodeURIComponent(device.id)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Falha ao revogar.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Aparelhos confiáveis</h1>
        <p className="text-sm text-slate-400">
          Aparelhos que já confirmaram o código de verificação. Em qualquer outro aparelho, o login pede a senha e o
          código do app autenticador.
        </p>
      </header>

      {enabled === false ? (
        <p className="card text-sm text-amber-300">
          Verificação em duas etapas desligada: defina AUTH_TOTP_SECRET nas variáveis de ambiente para ativá-la.
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <section className="space-y-3">
        {devices.length === 0 && enabled ? (
          <p className="card text-sm text-slate-400">Nenhum aparelho confiável ainda.</p>
        ) : null}
        {devices.map((device) => (
          <article key={device.id} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-100">{device.label}</p>
              {device.current ? <p className="text-xs text-emerald-300">Este aparelho</p> : null}
              <p className="text-xs text-slate-400">Último acesso: {formatDateTime(device.last_seen_at)}</p>
              <p className="text-[11px] text-slate-500">Confiável desde {formatDateTime(device.created_at)}</p>
            </div>
            <button
              type="button"
              onClick={() => revoke(device)}
              disabled={busy === device.id}
              className="shrink-0 rounded-md border border-rose-500/60 px-3 py-1.5 text-xs font-semibold text-rose-300 disabled:opacity-40"
            >
              {busy === device.id ? "Revogando…" : "Revogar"}
            </button>
          </article>
        ))}
      </section>
      <p className="text-[11px] text-slate-500">
        Revogar não encerra uma sessão já aberta (dura até 12 h); impede que o aparelho entre de novo sem o código.
      </p>
    </div>
  );
}
