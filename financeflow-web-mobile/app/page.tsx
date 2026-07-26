import { headers } from "next/headers";
import { DashboardPayload } from "@/types";
import { formatCurrency, formatPct, monthName } from "@/lib/format";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TrendTone = "positive" | "negative" | "neutral";

const CDB_INSTITUTION_COLORS: Record<string, string> = {
  "Itaú": "text-amber-300",
  "Santander": "text-rose-300",
  "Nubank": "text-violet-300",
  "XP": "text-sky-300",
  "Banco do Brasil": "text-blue-300",
  "Inter": "text-orange-300",
  "BTG Pactual": "text-cyan-300",
};

function getCdbColor(label: string): string {
  for (const [institution, color] of Object.entries(CDB_INSTITUTION_COLORS)) {
    if (label.includes(institution)) return color;
  }
  return "text-amber-300";
}

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
    return "border-2 border-emerald-400/90 bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950/35 shadow-[0_0_0_1px_rgba(52,211,153,0.24)]";
  if (tone === "negative")
    return "border-2 border-rose-400/90 bg-gradient-to-br from-slate-800 via-slate-900 to-rose-950/35 shadow-[0_0_0_1px_rgba(251,113,133,0.24)]";
  return "border-2 border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950";
}

function trendValueClass(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive") return "!text-emerald-300";
  if (tone === "negative") return "!text-rose-300";
  return "!text-slate-100";
}

function trendPctClass(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive") return "!text-emerald-300";
  if (tone === "negative") return "!text-rose-300";
  return "!text-slate-300";
}

function trendTitleClass(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive") return "!text-emerald-200";
  if (tone === "negative") return "!text-rose-200";
  return "!text-slate-300";
}

function trendMetaClass(value: number | null | undefined): string {
  const tone = trendTone(value);
  if (tone === "positive") return "text-emerald-300/90";
  if (tone === "negative") return "text-rose-300/90";
  return "text-slate-500";
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

  const cdbLabels = data.monthlySeries.length > 0
    ? data.monthlySeries[0].cdb_items.map((c) => c.label)
    : data.kpis.cdbItems.map((c) => c.label);

  const varValues = data.monthlySeries
    .map((m) => m.mom_value)
    .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  const varPcts = data.monthlySeries
    .map((m) => m.mom_pct)
    .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  const totalFiis = data.monthlySeries.reduce((acc, m) => acc + m.fiis, 0);
  const cdbTotals = cdbLabels.map((_, idx) =>
    data.monthlySeries.reduce((acc, m) => acc + (m.cdb_items[idx]?.income ?? 0), 0)
  );
  const varValueSum = varValues.reduce((acc, v) => acc + v, 0);
  const varPctAvg = varPcts.length ? varPcts.reduce((acc, v) => acc + v, 0) / varPcts.length : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-400">Visão mobile/web da renda passiva ({year})</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <article className={`min-h-[168px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momTotalPct)}`}>
          <p className={`card-title ${trendTitleClass(data.kpis.momTotalPct)}`}>Renda passiva mensal</p>
          <p className={`card-value ${trendValueClass(data.kpis.momTotalPct)}`}>{formatCurrency(data.kpis.totalMonth)}</p>
          <p className={`text-xs ${trendMetaClass(data.kpis.momTotalPct)}`}>
            <span className={`mr-1 font-semibold ${trendPctClass(data.kpis.momTotalPct)}`}>
              {trendSymbol(data.kpis.momTotalPct)} {formatPct(data.kpis.momTotalPct)}
            </span>
            vs mês anterior
          </p>
        </article>
        <article className={`min-h-[168px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momCdbPct)}`}>
          <p className={`card-title ${trendTitleClass(data.kpis.momCdbPct)}`}>Rendimento CDBs</p>
          <p className={`card-value ${trendValueClass(data.kpis.momCdbPct)}`}>{formatCurrency(data.kpis.cdbMonth)}</p>
          <p className={`text-xs ${trendMetaClass(data.kpis.momCdbPct)}`}>
            <span className={`mr-1 font-semibold ${trendPctClass(data.kpis.momCdbPct)}`}>
              {trendSymbol(data.kpis.momCdbPct)} {formatPct(data.kpis.momCdbPct)}
            </span>
            vs mês anterior
          </p>
        </article>
        <article className={`min-h-[168px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.momFiisPct)}`}>
          <p className={`card-title ${trendTitleClass(data.kpis.momFiisPct)}`}>Dividendos FIIs</p>
          <p className={`card-value ${trendValueClass(data.kpis.momFiisPct)}`}>{formatCurrency(data.kpis.fiisMonth)}</p>
          <p className={`text-xs ${trendMetaClass(data.kpis.momFiisPct)}`}>
            <span className={`mr-1 font-semibold ${trendPctClass(data.kpis.momFiisPct)}`}>
              {trendSymbol(data.kpis.momFiisPct)} {formatPct(data.kpis.momFiisPct)}
            </span>
            vs mês anterior
          </p>
        </article>
        <article className="min-h-[168px] rounded-[1.5rem] border-2 border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-3.5 shadow-lg">
          <p className="card-title">Renda acumulada no ano</p>
          <p className="card-value">{formatCurrency(data.kpis.ytd)}</p>
          <p className="text-xs text-slate-500">YTD</p>
        </article>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <article className="rounded-[1.5rem] border-2 border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-3.5 shadow-lg">
          <p className="card-title">Patrimônio investido</p>
          <p className="card-value">{formatCurrency(data.kpis.totalInvested)}</p>
        </article>
        <article className={`rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(data.kpis.portfolioYieldPct)}`}>
          <p className={`card-title ${trendTitleClass(data.kpis.portfolioYieldPct)}`}>Rentabilidade (12M)</p>
          <p className={`card-value ${trendValueClass(data.kpis.portfolioYieldPct)}`}>{formatPct(data.kpis.portfolioYieldPct)}</p>
          <p className={`text-xs ${trendMetaClass(data.kpis.portfolioYieldPct)}`}>
            Proventos 12M: {formatCurrency(data.kpis.rolling12)}
          </p>
        </article>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {data.kpis.cdbItems.map((cdb) => (
          <article key={cdb.investment_id} className={`min-h-[176px] rounded-[1.5rem] p-3.5 shadow-lg ${trendCardClass(cdb.momGrowth)}`}>
            <p className={`card-title ${trendTitleClass(cdb.momGrowth)}`}>{cdb.label} (M/M)</p>
            <p className={`card-value ${trendValueClass(cdb.momGrowth)}`}>
              {formatPct(cdb.momGrowth)}
            </p>
            <p className={`text-xs leading-snug ${trendMetaClass(cdb.momGrowth)}`}>
              <span className={`block font-semibold ${trendPctClass(cdb.momGrowth)}`}>
                {trendSymbol(cdb.momGrowth)} Δ {formatSignedCurrency(cdb.momDelta)}
              </span>
              <span className="mt-0.5 block">mês atual: {formatCurrency(cdb.currentMonth)}</span>
            </p>
          </article>
        ))}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Histórico mensal</h2>
        <table className="min-w-[860px] text-left text-xs md:text-sm">
          <thead className="border-b border-slate-700 text-slate-400">
            <tr>
              <th className="px-2 py-2">Mês</th>
              {cdbLabels.map((label) => (
                <th key={label} className={`px-2 py-2 ${getCdbColor(label)}`}>{label}</th>
              ))}
              <th className="px-2 py-2 text-emerald-300">FIIs</th>
              <th className="px-2 py-2">Total</th>
              <th className="min-w-[124px] px-2 py-2 whitespace-nowrap">VAR (M/M %)</th>
              <th className="min-w-[136px] px-2 py-2 whitespace-nowrap">VAR (M/M R$)</th>
            </tr>
          </thead>
          <tbody>
            {data.monthlySeries.map((m) => (
              <tr key={`${m.year}-${m.month}`} className="border-b border-slate-800/70 last:border-0">
                <td className="px-2 py-2 text-slate-200">{monthName(m.month)}</td>
                {m.cdb_items.map((cdb) => (
                  <td key={cdb.investment_id} className={`px-2 py-2 ${getCdbColor(cdb.label)}`}>
                    {formatCurrency(cdb.income)}
                  </td>
                ))}
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
              {cdbTotals.map((total, idx) => (
                <td key={idx} className={`px-2 py-2 ${getCdbColor(cdbLabels[idx])}`}>
                  {formatCurrency(total)}
                </td>
              ))}
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
