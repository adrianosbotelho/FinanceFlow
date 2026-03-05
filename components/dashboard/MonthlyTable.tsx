import { PassiveIncomeByMonth } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  data: PassiveIncomeByMonth[];
}

export function MonthlyTable({ data }: Props) {
  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-200">
        Tabela Mensal de Renda Passiva
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs md:text-sm">
          <thead className="border-b border-slate-800 text-slate-400">
            <tr>
              <th className="px-2 py-2">Mês</th>
              <th className="px-2 py-2">CDB Itaú</th>
              <th className="px-2 py-2">CDB Santander</th>
              <th className="px-2 py-2">FIIs</th>
              <th className="px-2 py-2">Total</th>
              <th className="px-2 py-2">MoM</th>
              <th className="px-2 py-2">YoY</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr
                key={`${m.year}-${m.month}`}
                className="border-b border-slate-800/60 last:border-0"
              >
                <td className="px-2 py-2 text-slate-300">
                  {monthLabel(m.month)} {m.year}
                </td>
                <td className="px-2 py-2">{formatCurrencyBRL(m.cdb_itau)}</td>
                <td className="px-2 py-2">
                  {formatCurrencyBRL(m.cdb_santander)}
                </td>
                <td className="px-2 py-2">
                  {formatCurrencyBRL(m.fii_dividends)}
                </td>
                <td className="px-2 py-2 font-medium text-slate-100">
                  {formatCurrencyBRL(m.total)}
                </td>
                <td className="px-2 py-2">
                  {formatPercentage(m.mom_growth ?? null)}
                </td>
                <td className="px-2 py-2">
                  {formatPercentage(m.yoy_growth ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
