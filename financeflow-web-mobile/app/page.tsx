import { headers } from "next/headers";
import { DashboardPayload } from "@/types";
import { formatCurrency, formatPct, monthName } from "@/lib/format";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TrendTone = "positive" | "negative" | "neutral";

async function loadDashboard(year: number, base: string, cookieHeader: string | null): Promise<DashboardPayload | null> {
  const res = await fetch(`${base}/api/dashboard?year=${year}`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  if (!res.ok) return null;
  return res.json();
}

function trendTone(value: number | null | undefined): TrendTone {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function trendSymbol(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive") return "▲";
  if (tone === "negative") return "▼";
  return "•";
}

function trendCardClass(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive")
    return "border-emerald-500/60 bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950/25";
  if (tone === "negative")
    return "border-rose-500/60 bg-gradient-to-br from-slate-800 via-slate-900 to-rose-950/25";
  return "border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950";
}

function trendValueClass(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive") return "text-emerald-300";
  if (tone === "negative") return "text-rose-300";
  return "text-slate-100";
}

function trendPctClass(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive") return "text-emerald-300";
  if (tone === "negative") return "text-rose-300";
  return "text-slate-300";
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value === 0) return "R$ 0,00";
  const absValue = formatCurrency(Math.abs(value));
  return `${value > 0 ? "+" : "-"}${absValue}`;
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

  const varValues = data.monthlySeries
    .map((m) => m.mom_value)
    .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  const varPcts = data.monthlySeries
    .map((m) => m.mom_pct)
    .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  const totalCdbItau = data.monthlySeries.reduce((acc, m) => acc + m.cdb_itau, 0);
  const totalCdbSantander = data.monthlySeries.reduce((acc, m) => acc + m.cdb_santander, 0);
  const totalFiis = data.monthlySeries.reduce((acc, m) => acc + m.fiis, 0);
  const varValueSum = varValues.reduce((acc, v) => acc + v, 0);
  const varPctAvg = varPcts.length ? varPcts.reduce((acc, v) => acc + v, 0) / varPcts.length : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-400">Visão mobile/web da renda passiva ({year})</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <article className={`card min-h-[168px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momTotalPct)}`}>
          <p className="card-title">Renda passiva mensal</p>
          <p className={`card-value ${trendValueClass(data.kpis.momTotalPct)}`}>{formatCurrency(data.kpis.totalMonth)}</p>
          <p className="text-xs text-slate-500">
            <span className={`mr-1 font-semibold ${trendPctClass(data.kpis.momTotalPct)}`}>
              {trendSymbol(data.kpis.momTotalPct)} {formatPct(data.kpis.momTotalPct)}
            </span>
            vs mês anterior
          </p>
        </article>
        <article className={`card min-h-[168px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momCdbPct)}`}>
          <p className="card-title">Rendimento CDBs</p>
          <p className={`card-value ${trendValueClass(data.kpis.momCdbPct)}`}>{formatCurrency(data.kpis.cdbMonth)}</p>
          <p className="text-xs text-slate-500">
            <span className={`mr-1 font-semibold ${trendPctClass(data.kpis.momCdbPct)}`}>
              {trendSymbol(data.kpis.momCdbPct)} {formatPct(data.kpis.momCdbPct)}
            </span>
            vs mês anterior
          </p>
        </article>
        <article className={`card min-h-[168px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momFiisPct)}`}>
          <p className="card-title">Dividendos FIIs</p>
          <p className={`card-value ${trendValueClass(data.kpis.momFiisPct)}`}>{formatCurrency(data.kpis.fiisMonth)}</p>
          <p className="text-xs text-slate-500">
            <span className={`mr-1 font-semibold ${trendPctClass(data.kpis.momFiisPct)}`}>
              {trendSymbol(data.kpis.momFiisPct)} {formatPct(data.kpis.momFiisPct)}
            </span>
            vs mês anterior
          </p>
        </article>
        <article className="card min-h-[168px] rounded-[1.5rem] bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-3.5 shadow-lg">
          <p className="card-title">Renda acumulada no ano</p>
          <p className="card-value">{formatCurrency(data.kpis.ytd)}</p>
          <p className="text-xs text-slate-500">YTD</p>
        </article>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <article className={`card min-h-[176px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momCdbItauPct)}`}>
          <p className="card-title">CDB Itaú (M/M)</p>
          <p className={`card-value ${trendValueClass(data.kpis.momCdbItauPct)}`}>
            {formatPct(data.kpis.momCdbItauPct)}
          </p>
          <p className="text-xs leading-snug text-slate-500">
            <span className={`block font-semibold ${trendPctClass(data.kpis.momCdbItauPct)}`}>
              {trendSymbol(data.kpis.momCdbItauPct)} Δ {formatSignedCurrency(data.kpis.momCdbItauValue)}
            </span>
            <span className="mt-0.5 block">mês atual: {formatCurrency(data.kpis.cdbItauMonth)}</span>
          </p>
        </article>

        <article className={`card min-h-[176px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momCdbSantanderPct)}`}>
          <p className="card-title">CDB Santander (M/M)</p>
          <p className={`card-value ${trendValueClass(data.kpis.momCdbSantanderPct)}`}>
            {formatPct(data.kpis.momCdbSantanderPct)}
          </p>
          <p className="text-xs leading-snug text-slate-500">
            <span className={`block font-semibold ${trendPctClass(data.kpis.momCdbSantanderPct)}`}>
              {trendSymbol(data.kpis.momCdbSantanderPct)} Δ {formatSignedCurrency(data.kpis.momCdbSantanderValue)}
            </span>
            <span className="mt-0.5 block">mês atual: {formatCurrency(data.kpis.cdbSantanderMonth)}</span>
          </p>
        </article>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Histórico mensal</h2>
        <table className="min-w-[860px] text-left text-xs md:text-sm">
          <thead className="border-b border-slate-700 text-slate-400">
            <tr>
              <th className="px-2 py-2">Mês</th>
              <th className="px-2 py-2">CDB Itaú</th>
              <th className="px-2 py-2">CDB Santander</th>
              <th className="px-2 py-2">FIIs</th>
              <th className="px-2 py-2">Total</th>
              <th className="min-w-[124px] px-2 py-2 whitespace-nowrap">VAR (M/M %)</th>
              <th className="min-w-[136px] px-2 py-2 whitespace-nowrap">VAR (M/M R$)</th>
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
                <td className={`min-w-[124px] px-2 py-2 font-semibold whitespace-nowrap ${trendPctClass(m.mom_pct)}`}>
                  {formatPct(m.mom_pct)}
                </td>
                <td className={`min-w-[136px] px-2 py-2 font-semibold whitespace-nowrap ${trendPctClass(m.mom_value)}`}>
                  {formatSignedCurrency(m.mom_value)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-900/70 font-semibold">
              <td className="px-2 py-2 uppercase tracking-wide text-slate-300">Resumo</td>
              <td className="px-2 py-2 text-amber-300">{formatCurrency(totalCdbItau)}</td>
              <td className="px-2 py-2 text-rose-300">{formatCurrency(totalCdbSantander)}</td>
              <td className="px-2 py-2 text-emerald-300">{formatCurrency(totalFiis)}</td>
              <td className="px-2 py-2 text-slate-100">{formatCurrency(data.kpis.ytd)}</td>
              <td className={`min-w-[124px] px-2 py-2 whitespace-nowrap ${trendPctClass(varPctAvg)}`}>
                {varPctAvg === null ? "-" : `Média ${formatPct(varPctAvg)}`}
              </td>
              <td className={`min-w-[136px] px-2 py-2 whitespace-nowrap ${trendPctClass(varValueSum)}`}>
                {formatSignedCurrency(varValueSum)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
