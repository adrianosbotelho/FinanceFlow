"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HealthCheckPayload } from "../../types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export function HealthCheckPageClient() {
  const [data, setData] = useState<HealthCheckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/health-check", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Erro ao consultar health check (${res.status})`);
      }
      const payload = (await res.json()) as HealthCheckPayload;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar health check.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const overallClass = useMemo(() => {
    if (!data) return "bg-slate-700 text-slate-100";
    return data.status === "ok"
      ? "bg-emerald-900/40 text-emerald-300"
      : "bg-amber-900/40 text-amber-300";
  }, [data]);

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 text-sm text-slate-300">
        Carregando Health Check...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-5 text-sm text-rose-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">Health Check</h2>
            <p className="text-sm text-slate-400">
              Infraestrutura e configuração da aplicação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${overallClass}`}>
              {data.status === "ok" ? "OK" : "DEGRADED"}
            </span>
            <button
              type="button"
              onClick={() => void load(true)}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              {refreshing ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Última leitura: {formatTimestamp(data.generatedAt)}
        </p>
        {error && (
          <p className="mt-2 text-xs text-amber-300">
            Última atualização parcial com erro: {error}
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Aplicação</p>
          <p className="text-sm font-semibold text-slate-100">
            {data.app.name} v{data.app.version}
          </p>
          <p className="text-xs text-slate-500">NODE_ENV: {data.app.nodeEnv}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Runtime</p>
          <p className="text-sm font-semibold text-slate-100">{data.runtime.nodeVersion}</p>
          <p className="text-xs text-slate-500">
            {data.runtime.platform}/{data.runtime.arch} PID {data.runtime.pid}
          </p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Uptime do processo</p>
          <p className="text-sm font-semibold text-slate-100">
            {formatUptime(data.app.uptimeSec)}
          </p>
          <p className="text-xs text-slate-500">Porta: {data.app.financeflowPort ?? "n/d"}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">Banco (Supabase)</p>
          <p
            className={`text-sm font-semibold ${
              data.database.status === "ok" ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {data.database.status === "ok" ? "Conectado" : "Falha"}
          </p>
          <p className="text-xs text-slate-500">
            Latência: {data.database.latencyMs ?? "n/d"} ms
          </p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs text-slate-400">APIs dos painéis</p>
          <p
            className={`text-sm font-semibold ${
              data.api.status === "ok" ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {data.api.status === "ok" ? "Sem falhas" : "Com falhas"}
          </p>
          <p className="text-xs text-slate-500">
            {data.api.checks.filter((check) => check.status === "ok").length}/
            {data.api.checks.length} endpoints OK
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Configuração de ambiente</h3>
          <div className="space-y-2 text-sm">
            {Object.entries(data.environment.required).map(([key, ok]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-slate-300">{key}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    ok ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300"
                  }`}
                >
                  {ok ? "OK" : "MISSING"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-400">
            <p>Supabase host: {data.environment.supabaseHost ?? "inválido/não definido"}</p>
            <p>Base URL: {data.app.nextPublicBaseUrl ?? "não definida"}</p>
            <p>Meta anual (env): {data.environment.optional.FINANCEFLOW_ANNUAL_INCOME_TARGET ?? "padrão"}</p>
            <p>CDI anual (env): {data.environment.optional.FINANCEFLOW_CDI_ANNUAL_RATE ?? "padrão"}</p>
          </div>
        </article>

        <article className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Verificação de tabelas</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Tabela</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Registros</th>
                  <th className="px-2 py-2">Latência</th>
                </tr>
              </thead>
              <tbody>
                {data.database.tables.map((row) => (
                  <tr key={row.table} className="border-b border-slate-800/60">
                    <td className="px-2 py-2 text-slate-200">{row.table}</td>
                    <td
                      className={`px-2 py-2 font-semibold ${
                        row.status === "ok" ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {row.status.toUpperCase()}
                    </td>
                    <td className="px-2 py-2 text-slate-300">
                      {row.count === null ? "n/d" : row.count}
                    </td>
                    <td className="px-2 py-2 text-slate-300">{row.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.database.error && (
            <p className="mt-3 text-xs text-rose-300">Erro de banco: {data.database.error}</p>
          )}
        </article>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Saúde das APIs consumidas pelos painéis
          </h3>
          <p className="text-xs text-slate-400">
            Verifica os endpoints GET usados para manter Dashboard, Metas, Investimentos e demais telas atualizados.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs md:text-sm">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-2 py-2">Painel</th>
                <th className="px-2 py-2">Origem</th>
                <th className="px-2 py-2">API</th>
                <th className="px-2 py-2">Endpoint</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">HTTP</th>
                <th className="px-2 py-2">Latência</th>
                <th className="px-2 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {data.api.checks.map((check) => (
                <tr key={`${check.panel}-${check.endpoint}`} className="border-b border-slate-800/60">
                  <td className="px-2 py-2 text-slate-300">{check.panel}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        check.source === "external"
                          ? "bg-amber-900/40 text-amber-300"
                          : "bg-cyan-900/40 text-cyan-300"
                      }`}
                    >
                      {check.source.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-200">{check.name}</td>
                  <td className="break-all px-2 py-2 text-slate-400">{check.endpoint}</td>
                  <td
                    className={`px-2 py-2 font-semibold ${
                      check.status === "ok" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {check.status.toUpperCase()}
                  </td>
                  <td className="px-2 py-2 text-slate-300">{check.httpStatus ?? "n/d"}</td>
                  <td className="px-2 py-2 text-slate-300">{check.latencyMs} ms</td>
                  <td className="px-2 py-2 text-xs text-slate-400">{check.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
