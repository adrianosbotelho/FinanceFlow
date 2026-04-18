import { headers } from "next/headers";
import { GoalRow } from "@/types";
import { formatCurrency, monthName } from "@/lib/format";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadGoals(year: number, month: number, base: string, cookieHeader: string | null): Promise<GoalRow[]> {
  const res = await fetch(`${base}/api/goals?year=${year}&month=${month}`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  if (!res.ok) return [];
  return res.json();
}

function formatProgress(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function progressTone(progress: number | null): string {
  if (progress === null || Number.isNaN(progress)) return "text-slate-300";
  if (progress >= 100) return "text-emerald-300";
  if (progress >= 70) return "text-cyan-300";
  if (progress >= 40) return "text-amber-300";
  return "text-rose-300";
}

export default async function GoalsPage({ searchParams }: { searchParams?: { year?: string } }) {
  const envReady = hasSupabaseServerEnv();
  if (!envReady) {
    return (
      <div className="card">
        <h1 className="text-lg font-bold">Metas</h1>
        <p className="mt-2 text-sm text-slate-400">
          Configure as variaveis do Supabase para carregar metas mensais e anuais.
        </p>
      </div>
    );
  }

  const year = Number(searchParams?.year ?? new Date().getFullYear());
  const month = new Date().getMonth() + 1;
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookieHeader = h.get("cookie");
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";
  const rows = await loadGoals(year, month, base, cookieHeader);

  const monthly = rows.filter((r) => r.type === "monthly");
  const annual = rows.filter((r) => r.type === "annual");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Metas</h1>
        <p className="text-sm text-slate-400">Consulta rápida de metas mensais e anuais.</p>
      </header>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Metas mensais ({monthName(month)}/{year})</h2>
        <div className="space-y-2 text-sm">
          {monthly.length === 0 ? (
            <p className="text-slate-400">Sem metas mensais para o período.</p>
          ) : (
            monthly.map((g) => (
              <div key={`m-${g.investment_id}`} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{g.investment_label}</p>
                    <p className="text-cyan-300">Meta: {formatCurrency(g.target)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">Atual</p>
                    <p className="font-semibold text-slate-100">{formatCurrency(g.current_value)}</p>
                    <p className={`text-xs font-semibold ${progressTone(g.progress_pct)}`}>
                      {formatProgress(g.progress_pct)} atingido
                    </p>
                    <p className="text-[11px] text-slate-500">Gap: {formatCurrency(g.gap_value)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Metas anuais ({year})</h2>
        <div className="space-y-2 text-sm">
          {annual.length === 0 ? (
            <p className="text-slate-400">Sem metas anuais para o período.</p>
          ) : (
            annual.map((g) => (
              <div key={`a-${g.investment_id}`} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{g.investment_label}</p>
                    <p className="text-cyan-300">Meta anual: {formatCurrency(g.target)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">Atual</p>
                    <p className="font-semibold text-slate-100">{formatCurrency(g.current_value)}</p>
                    <p className={`text-xs font-semibold ${progressTone(g.progress_pct)}`}>
                      {formatProgress(g.progress_pct)} atingido
                    </p>
                    <p className="text-[11px] text-slate-500">Gap: {formatCurrency(g.gap_value)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
