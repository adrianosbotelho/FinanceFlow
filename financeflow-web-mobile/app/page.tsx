import { headers } from "next/headers";
import { DashboardPayload } from "@/types";
import { formatCurrency, formatPct, monthName } from "@/lib/format";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadDashboard(year: number, base: string, cookieHeader: string | null): Promise<DashboardPayload | null> {
  const res = await fetch(`${base}/api/dashboard?year=${year}`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { year?: string };
}) {
  const envReady = hasSupabaseServerEnv();
  const year = Number(searchParams?.year ?? new Date().getFullYear());
  if (!envReady) {
    return (
      <div className="card">
        <h1 className="text-lg font-bold">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">
          Configure as variaveis do Supabase para carregar dados reais.
        </p>
      </div>
    );
  }

  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookieHeader = h.get("cookie");
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";
  const data = await loadDashboard(year, base, cookieHeader);

  if (!data) {
    return <p className="text-sm text-rose-300">Falha ao carregar dashboard.</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-400">Visão mobile/web da renda passiva ({year})</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <article className="card">
          <p className="card-title">Renda passiva mensal</p>
          <p className="card-value">{formatCurrency(data.kpis.totalMonth)}</p>
          <p className="text-xs text-slate-500">{formatPct(data.kpis.momTotalPct)} vs mês anterior</p>
        </article>
        <article className="card">
          <p className="card-title">Rendimento CDBs</p>
          <p className="card-value">{formatCurrency(data.kpis.cdbMonth)}</p>
          <p className="text-xs text-slate-500">{formatPct(data.kpis.momCdbPct)} vs mês anterior</p>
        </article>
        <article className="card">
          <p className="card-title">Dividendos FIIs</p>
          <p className="card-value">{formatCurrency(data.kpis.fiisMonth)}</p>
          <p className="text-xs text-slate-500">{formatPct(data.kpis.momFiisPct)} vs mês anterior</p>
        </article>
        <article className="card">
          <p className="card-title">Renda acumulada no ano</p>
          <p className="card-value">{formatCurrency(data.kpis.ytd)}</p>
          <p className="text-xs text-slate-500">YTD</p>
        </article>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Histórico mensal</h2>
        <table className="min-w-full text-left text-xs md:text-sm">
          <thead className="border-b border-slate-700 text-slate-400">
            <tr>
              <th className="px-2 py-2">Mês</th>
              <th className="px-2 py-2">CDB Itaú</th>
              <th className="px-2 py-2">CDB Santander</th>
              <th className="px-2 py-2">FIIs</th>
              <th className="px-2 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.monthlySeries.map((m) => (
              <tr key={`${m.year}-${m.month}`} className="border-b border-slate-800/70 last:border-0">
                <td className="px-2 py-2 text-slate-200">{monthName(m.month)}</td>
                <td className="px-2 py-2 text-amber-300">{formatCurrency(m.cdb_itau)}</td>
                <td className="px-2 py-2 text-rose-300">{formatCurrency(m.cdb_santander)}</td>
                <td className="px-2 py-2 text-emerald-300">{formatCurrency(m.fiis)}</td>
                <td className="px-2 py-2 font-semibold text-slate-100">{formatCurrency(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
