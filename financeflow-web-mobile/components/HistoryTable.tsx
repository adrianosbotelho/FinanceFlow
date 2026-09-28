// Mesma leitura da tabela "Desempenho histórico mensal" do desktop, adaptada ao celular:
// resumo do período, "—" sem renda, mês em andamento com dias úteis/data-base e projeções,
// variação M/M (% e R$ na mesma célula) e totais por coluna.
import { DashboardMonth } from "@/types";
import { formatCurrency, formatPct, monthLabel } from "@/lib/format";
import { countBusinessDaysElapsedInMonth, countBusinessDaysInMonth } from "@/lib/finance/business-days";

const CDB_INSTITUTION_COLORS: Record<string, string> = {
  "Itaú": "text-amber-300",
  "Santander": "text-rose-300",
  "Nubank": "text-violet-300",
  "XP": "text-sky-300",
  "Banco do Brasil": "text-blue-300",
  "Inter": "text-orange-300",
  "BTG Pactual": "text-cyan-300",
};

function cdbColor(label: string): string {
  for (const [institution, color] of Object.entries(CDB_INSTITUTION_COLORS)) {
    if (label.includes(institution)) return color;
  }
  return "text-amber-300";
}

function tone(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || Math.abs(value) < 0.005) return "text-slate-400";
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function arrow(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return value > 0 ? "▲ " : value < 0 ? "▼ " : "• ";
}

function signedCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatCurrency(Math.abs(value))}`;
}

function shortMonth(m: DashboardMonth): string {
  return `${monthLabel(m.month).toLowerCase()}/${String(m.year).slice(2)}`;
}

function Money({ value, projected, className }: { value: number; projected?: number; className: string }) {
  const showProjection = projected !== undefined && projected > 0;
  return (
    <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${value > 0 ? className : "text-slate-600"}`}>
      {value > 0 ? formatCurrency(value) : "—"}
      {showProjection ? (
        <span className="block text-[10px] font-normal text-slate-400">Projeção {formatCurrency(projected)}</span>
      ) : null}
    </td>
  );
}

export function HistoryTable({
  months,
  cdbLabels,
  asOfDate,
}: {
  months: DashboardMonth[];
  cdbLabels: string[];
  /** Data-base (aaaa-mm-dd) do mês em andamento. */
  asOfDate: string | null;
}) {
  const inProgress = (m: DashboardMonth) => m.projected_total !== undefined;
  const closed = months.filter((m) => !inProgress(m));
  const totalAll = months.reduce((acc, m) => acc + m.total, 0);
  const average = closed.length ? closed.reduce((acc, m) => acc + m.total, 0) / closed.length : null;
  const best = closed.reduce<DashboardMonth | null>((acc, m) => (acc === null || m.total > acc.total ? m : acc), null);
  const worst = closed.reduce<DashboardMonth | null>((acc, m) => (acc === null || m.total < acc.total ? m : acc), null);
  const first = closed[0] ?? null;
  const last = closed.length > 1 ? closed[closed.length - 1] : null;
  const evolution = first && last && first.total > 0 ? ((last.total - first.total) / first.total) * 100 : null;
  const maxTotal = Math.max(1, ...months.map((m) => Math.max(m.total, m.projected_total ?? 0)));
  const cdbTotals = cdbLabels.map((_, idx) => months.reduce((acc, m) => acc + (m.cdb_items[idx]?.income ?? 0), 0));
  const totalFiis = months.reduce((acc, m) => acc + m.fiis, 0);
  const hasFii = totalFiis > 0;

  const asOf = asOfDate ? asOfDate.split("-").map(Number) : null;
  const businessDaysLabel = (m: DashboardMonth): string | null => {
    const total = countBusinessDaysInMonth(m.year, m.month);
    if (!asOf || asOf[0] !== m.year || asOf[1] !== m.month) return `${total} d.u.`;
    const elapsed = countBusinessDaysElapsedInMonth(m.year, m.month, asOf[2]);
    return `${elapsed}/${total} d.u. · até ${String(asOf[2]).padStart(2, "0")}/${String(asOf[1]).padStart(2, "0")}`;
  };

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Desempenho histórico mensal</h2>
        <p className="text-[11px] text-slate-500">Renda passiva por mês e por investimento.</p>
      </div>

      {months.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Total no período</p>
            <p className="font-bold text-slate-100">{formatCurrency(totalAll)}</p>
            <p className="text-[10px] text-slate-500">{months.length} meses</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Média mensal</p>
            <p className="font-bold text-slate-100">{average === null ? "—" : formatCurrency(average)}</p>
            <p className="text-[10px] text-slate-500">meses fechados</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Melhor mês</p>
            <p className="font-bold text-emerald-300">{best ? formatCurrency(best.total) : "—"}</p>
            <p className="text-[10px] text-slate-500">{best ? shortMonth(best) : ""}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Pior mês</p>
            <p className="font-bold text-rose-300">{worst ? formatCurrency(worst.total) : "—"}</p>
            <p className="text-[10px] text-slate-500">{worst ? shortMonth(worst) : ""}</p>
          </div>
          <div className="col-span-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Evolução</p>
            <p className={`font-bold ${tone(evolution)}`}>
              {arrow(evolution)}
              {evolution === null ? "—" : formatPct(evolution)}
            </p>
            <p className="text-[10px] text-slate-500">
              {first && last ? `${shortMonth(first)} → ${shortMonth(last)} (meses fechados)` : "meses fechados"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-[640px] text-left text-xs">
          <thead className="border-b border-slate-700 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-2 py-2">Mês</th>
              {cdbLabels.map((label) => (
                <th key={label} className={`px-2 py-2 text-right ${cdbColor(label)}`}>
                  {label}
                </th>
              ))}
              {hasFii ? <th className="px-2 py-2 text-right text-emerald-300">FIIs</th> : null}
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Var. M/M</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const current = inProgress(m);
              return (
                <tr
                  key={`${m.year}-${m.month}`}
                  className={`border-b border-slate-800/70 ${current ? "bg-indigo-500/5" : ""}`}
                >
                  <td className="whitespace-nowrap px-2 py-2 text-slate-200">
                    {monthLabel(m.month)}/{String(m.year).slice(2)}
                    {current ? (
                      <span className="mt-0.5 block w-fit rounded-full bg-indigo-500/20 px-1.5 text-[9px] font-semibold text-indigo-200">
                        em andamento
                      </span>
                    ) : null}
                    <span className="block text-[9px] text-cyan-300/80">{businessDaysLabel(m)}</span>
                  </td>
                  {m.cdb_items.map((cdb) => (
                    <Money
                      key={cdb.investment_id}
                      value={cdb.income}
                      projected={current ? cdb.projected : undefined}
                      className={cdbColor(cdb.label)}
                    />
                  ))}
                  {hasFii ? (
                    <Money value={m.fiis} projected={current ? m.projected_fii : undefined} className="text-emerald-300" />
                  ) : null}
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <span className="font-semibold tabular-nums text-slate-100">{formatCurrency(m.total)}</span>
                    <span className="mt-1 block h-1 w-full rounded-full bg-slate-700/60">
                      <span
                        className={`ml-auto block h-1 rounded-full ${current ? "bg-indigo-400/60" : "bg-indigo-400"}`}
                        style={{ width: `${Math.min(100, (m.total / maxTotal) * 100)}%` }}
                      />
                    </span>
                    {current && m.projected_total !== undefined ? (
                      <span className="mt-0.5 block text-[10px] text-slate-400">Projeção {formatCurrency(m.projected_total)}</span>
                    ) : null}
                  </td>
                  {current ? (
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <span className="block text-[10px] text-slate-500">parcial</span>
                      <span className={`font-semibold ${tone(m.projected_mom_pct)}`}>
                        Projeção {m.projected_mom_pct === null || m.projected_mom_pct === undefined ? "—" : formatPct(m.projected_mom_pct)}
                      </span>
                      <span className={`block text-[10px] ${tone(m.projected_mom_value)}`}>
                        {signedCurrency(m.projected_mom_value)}
                      </span>
                    </td>
                  ) : (
                    <td className={`whitespace-nowrap px-2 py-2 text-right ${tone(m.mom_pct)}`}>
                      <span className="font-semibold">
                        {arrow(m.mom_pct)}
                        {m.mom_pct === null ? "—" : formatPct(m.mom_pct)}
                      </span>
                      {m.mom_value !== null ? (
                        <span className="block text-[10px] opacity-80">{signedCurrency(m.mom_value)}</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900/70 font-semibold">
              <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-slate-300">Total</td>
              {cdbTotals.map((total, idx) => (
                <td key={cdbLabels[idx]} className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${cdbColor(cdbLabels[idx])}`}>
                  {formatCurrency(total)}
                </td>
              ))}
              {hasFii ? (
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-emerald-300">{formatCurrency(totalFiis)}</td>
              ) : null}
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-100">{formatCurrency(totalAll)}</td>
              <td className="px-2 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">
        Mês em andamento: acumulado até o dia útil anterior (d.u. com dados / total); a variação usa a projeção de
        fechamento. Média, melhor/pior mês e evolução consideram só meses fechados. Deslize a tabela para o lado.
      </p>
    </section>
  );
}
