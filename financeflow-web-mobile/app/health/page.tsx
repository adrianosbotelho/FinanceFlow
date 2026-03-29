"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type HealthPayload = {
  status: string;
  timestamp: string;
  scope?: "public" | "private";
  checks?: {
    supabaseUrl: boolean;
    supabaseAnon: boolean;
    supabaseServiceRole: boolean;
    dbReachable?: boolean;
  };
  metrics?: {
    dbLatencyMs?: number | null;
  };
  errors?: {
    db?: string | null;
  };
};

type Row = {
  name: string;
  ok: boolean;
  detail: string;
};

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
        ok ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
      }`}
    >
      {ok ? "OK" : "Pendente"}
    </span>
  );
}

export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HealthPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as HealthPayload;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clientRows = useMemo<Row[]>(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return [
        { name: "Modo app (standalone)", ok: false, detail: "Aguardando render no cliente" },
        { name: "Service Worker", ok: false, detail: "Aguardando render no cliente" },
        { name: "Conectividade", ok: false, detail: "Aguardando render no cliente" },
        { name: "Dispositivo iPhone", ok: false, detail: "Aguardando render no cliente" },
      ];
    }

    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const sw = "serviceWorker" in navigator;
    const online = navigator.onLine;
    const iphone = /iPhone/i.test(navigator.userAgent);

    return [
      { name: "Modo app (standalone)", ok: standalone || iosStandalone, detail: "PWA instalado na tela inicial" },
      { name: "Service Worker", ok: sw, detail: "Suporte para cache/offline" },
      { name: "Conectividade", ok: online, detail: online ? "Dispositivo online" : "Dispositivo offline" },
      { name: "Dispositivo iPhone", ok: iphone, detail: iphone ? "Acesso por iPhone detectado" : "Acesso fora de iPhone" },
    ];
  }, []);

  const hasDetailedChecks = Boolean(data?.checks);
  const serverRows: Row[] = data && hasDetailedChecks
    ? [
        {
          name: "NEXT_PUBLIC_SUPABASE_URL",
          ok: Boolean(data.checks?.supabaseUrl),
          detail: "URL do projeto Supabase",
        },
        {
          name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          ok: Boolean(data.checks?.supabaseAnon),
          detail: "Chave publica do cliente",
        },
        {
          name: "SUPABASE_SERVICE_ROLE_KEY",
          ok: Boolean(data.checks?.supabaseServiceRole),
          detail: "Chave server-side para API routes",
        },
        {
          name: "Conexao com banco (ping)",
          ok: Boolean(data.checks?.dbReachable),
          detail: data.checks?.dbReachable
            ? `Banco acessivel (${data.metrics?.dbLatencyMs ?? "-"} ms)`
            : `Banco indisponivel${data.errors?.db ? `: ${data.errors.db}` : ""}`,
        },
      ]
    : data
      ? [
          {
            name: "Health público",
            ok: data.status === "ok",
            detail: "Detalhes internos ocultos sem sessão autenticada.",
          },
        ]
      : [];

  const serverOk = serverRows.every((r) => r.ok);
  const clientOk = clientRows.every((r) => r.ok);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Health Check</h1>
          <p className="text-sm text-slate-400">Qualidade de execucao do web/mobile (Fase 5).</p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800"
        >
          Revalidar
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="card">
          <p className="card-title">Backend/Env</p>
          <p className="card-value text-lg">{serverOk ? "Pronto para dados reais" : "Configurar env"}</p>
          <p className="text-xs text-slate-500">
            {data ? `Ultima leitura: ${new Date(data.timestamp).toLocaleString("pt-BR")}` : "Sem leitura ainda"}
          </p>
        </article>
        <article className="card">
          <p className="card-title">Cliente/PWA</p>
          <p className="card-value text-lg">{clientOk ? "Pronto para iPhone" : "Ajustes pendentes"}</p>
          <p className="text-xs text-slate-500">Verifica modo standalone, SW e conectividade.</p>
        </article>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Checks de servidor</h2>
        {loading ? <p className="text-sm text-slate-400">Carregando...</p> : null}
        {error ? <p className="text-sm text-rose-300">Falha: {error}</p> : null}
        {!loading && !error ? (
          <div className="space-y-2">
            {serverRows.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 p-3">
                <div>
                  <p className="text-sm font-semibold">{row.name}</p>
                  <p className="text-xs text-slate-400">{row.detail}</p>
                </div>
                <StatusBadge ok={row.ok} />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Checks de cliente</h2>
        <div className="space-y-2">
          {clientRows.map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 p-3">
              <div>
                <p className="text-sm font-semibold">{row.name}</p>
                <p className="text-xs text-slate-400">{row.detail}</p>
              </div>
              <StatusBadge ok={row.ok} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
