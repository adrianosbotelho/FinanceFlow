import { headers } from "next/headers";
import { GoalRow } from "@/types";
import { formatCurrency, monthName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadGoals(year: number, month: number, base: string): Promise<GoalRow[]> {
  const res = await fetch(`${base}/api/goals?year=${year}&month=${month}`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function GoalsPage({ searchParams }: { searchParams?: { year?: string } }) {
  const year = Number(searchParams?.year ?? new Date().getFullYear());
  const month = new Date().getMonth() + 1;
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";
  const rows = await loadGoals(year, month, base);

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
                <p className="font-semibold text-slate-100">{g.investment_label}</p>
                <p className="text-cyan-300">Meta: {formatCurrency(g.target)}</p>
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
                <p className="font-semibold text-slate-100">{g.investment_label}</p>
                <p className="text-cyan-300">Meta anual: {formatCurrency(g.target)}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
