import { Investment } from "../../types";
import { InvestmentForm } from "../../components/forms/InvestmentForm";
import { formatCurrencyBRL } from "../../lib/formatters";

async function fetchInvestments(): Promise<Investment[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/investments`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function InvestmentsPage() {
  const investments = await fetchInvestments();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Investimentos</h2>
        <p className="text-sm text-slate-400">
          Cadastre seus CDBs e FIIs para acompanhar a renda passiva.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">
            Carteira atual
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Instituição</th>
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">Valor Investido</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-slate-800/60 last:border-0"
                  >
                    <td className="px-2 py-2 text-slate-300">{inv.type}</td>
                    <td className="px-2 py-2 text-slate-300">
                      {inv.institution}
                    </td>
                    <td className="px-2 py-2 text-slate-300">{inv.name}</td>
                    <td className="px-2 py-2 font-medium text-slate-100">
                      {formatCurrencyBRL(inv.amount_invested)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <InvestmentForm />
      </div>
    </div>
  );
}
