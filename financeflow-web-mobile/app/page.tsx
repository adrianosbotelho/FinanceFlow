import { headers } from "next/headers";
import { DailyIncomePayload, DashboardPayload } from "@/types";
import { formatCurrency, formatPct } from "@/lib/format";
import { hasSupabaseServerEnv } from "@/lib/env";
import { HistoryTable } from "@/components/HistoryTable";
import { DailyIncomeCard } from "@/components/DailyIncomeCard";

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

async function loadDailyIncome(year: number, base: string, cookieHeader: string | null): Promise<DailyIncomePayload | null> {
  try {
    const res = await fetch(`${base}/api/dashboard/daily-income?year=${year}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
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

function ProjectionLine({ value, pct }: { value: number | null | undefined; pct: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <span className="mt-1 block text-[11px] text-slate-400">
      Projeção: {formatCurrency(value)}
      {pct !== null && pct !== undefined ? ` (${formatPct(pct)} vs mês anterior)` : ""}
    </span>
  );
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
  const [data, dailyIncome] = await Promise.all([
    loadDashboard(year, base, cookieHeader),
    loadDailyIncome(year, base, cookieHeader),
  ]);

  if (!data) {
    return <p className="text-sm text-rose-300">Falha ao carregar dashboard.</p>;
  }

  const cdbLabels = data.monthlySeries.length > 0
    ? data.monthlySeries[0].cdb_items.map((c) => c.label)
    : data.kpis.cdbItems.map((c) => c.label);


  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-400">Visão mobile/web da renda passiva ({year})</p>
        {data.kpis.isCurrentMonth && data.kpis.asOfDate ? (
          <p className="text-[11px] text-slate-500">
            Variações reais em destaque; projeção do mês com dados até {data.kpis.asOfDate.split("-").reverse().slice(0, 2).join("/")}.
          </p>
        ) : null}
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
            <ProjectionLine value={data.kpis.projectedTotal} pct={data.kpis.projectedMomTotalPct} />
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
            <ProjectionLine value={data.kpis.projectedCdb} pct={data.kpis.projectedMomCdbPct} />
          </p>
        </article>
        {data.kpis.hasActiveFii || data.kpis.fiisMonth > 0 ? (
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
        ) : null}
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
              <ProjectionLine value={cdb.projectedMonth} pct={cdb.projectedMomGrowth} />
            </p>
          </article>
        ))}
      </section>

      <DailyIncomeCard data={dailyIncome} />

      <HistoryTable months={data.monthlySeries} cdbLabels={cdbLabels} asOfDate={data.kpis.asOfDate} />
    </div>
  );
}
