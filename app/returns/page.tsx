import { Investment } from "../../types";
import { ReturnForm } from "../../components/forms/ReturnForm";
import { formatCurrencyBRL } from "../../lib/formatters";

async function fetchData() {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const [investmentsRes, returnsRes] = await Promise.all([
    fetch(`${base}/api/investments`, { cache: "no-store" }),
    fetch(`${base}/api/returns`, { cache: "no-store" }),
  ]);

  const investments: Investment[] = investmentsRes.ok
    ? await investmentsRes.json()
    : [];
  const returns: any[] = returnsRes.ok ? await returnsRes.json() : [];

  return { investments, returns };
}

export default async function ReturnsPage() {
  const { investments, returns } = await fetchData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">
          Retornos Mensais
        </h2>
        <p className="text-sm text-slate-400">
          Registre os rendimentos de cada investimento por mês.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-800 bg-surface/80 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">
            Histórico de retornos
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Ano</th>
                  <th className="px-2 py-2">Mês</th>
                  <th className="px-2 py-2">Investimento</th>
                  <th className="px-2 py-2">Renda</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => {
                  const inv = investments.find(
                    (i) => i.id === ret.investment_id,
                  );
                  return (
                    <tr
                      key={ret.id}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-2 py-2 text-slate-300">{ret.year}</td>
                      <td className="px-2 py-2 text-slate-300">{ret.month}</td>
                      <td className="px-2 py-2 text-slate-300">
                        {inv ? `${inv.name} (${inv.institution})` : "—"}
                      </td>
                      <td className="px-2 py-2 font-medium text-slate-100">
                        {formatCurrencyBRL(ret.income_value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <ReturnForm investments={investments} />
      </div>
    </div>
  );
}
