import { headers } from "next/headers";
import { Investment } from "@/types";
import { formatCurrency, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadInvestments(base: string): Promise<Investment[]> {
  const res = await fetch(`${base}/api/investments`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function InvestmentsPage() {
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";

  const data = await loadInvestments(base);
  const total = data.reduce((acc, i) => acc + Number(i.amount_invested ?? 0), 0);
  const cdb = data.filter((i) => i.type === "CDB").reduce((acc, i) => acc + Number(i.amount_invested ?? 0), 0);
  const fii = data.filter((i) => i.type === "FII").reduce((acc, i) => acc + Number(i.amount_invested ?? 0), 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Investimentos</h1>
        <p className="text-sm text-slate-400">Consulta da carteira para iPhone/web.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="card">
          <p className="card-title">Total investido</p>
          <p className="card-value">{formatCurrency(total)}</p>
        </article>
        <article className="card">
          <p className="card-title">Exposição CDB</p>
          <p className="card-value text-amber-300">{formatCurrency(cdb)}</p>
          <p className="text-xs text-slate-500">{formatPct(total > 0 ? (cdb / total) * 100 : 0)}</p>
        </article>
        <article className="card">
          <p className="card-title">Exposição FIIs</p>
          <p className="card-value text-emerald-300">{formatCurrency(fii)}</p>
          <p className="text-xs text-slate-500">{formatPct(total > 0 ? (fii / total) * 100 : 0)}</p>
        </article>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold">Carteira</h2>
        <table className="min-w-full text-left text-xs md:text-sm">
          <thead className="border-b border-slate-700 text-slate-400">
            <tr>
              <th className="px-2 py-2">Tipo</th>
              <th className="px-2 py-2">Instituição</th>
              <th className="px-2 py-2">Nome</th>
              <th className="px-2 py-2">Valor</th>
              <th className="px-2 py-2">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((i) => {
              const amount = Number(i.amount_invested ?? 0);
              return (
                <tr key={i.id} className="border-b border-slate-800/70 last:border-0">
                  <td className="px-2 py-2">{i.type}</td>
                  <td className="px-2 py-2">{i.institution}</td>
                  <td className="px-2 py-2">{i.name}</td>
                  <td className="px-2 py-2">{formatCurrency(amount)}</td>
                  <td className="px-2 py-2">{formatPct(total > 0 ? (amount / total) * 100 : 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
