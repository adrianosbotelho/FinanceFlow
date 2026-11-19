"use client";

// Mesmo card "Proventos e aportes (12M)" do Dashboard desktop: proventos + aportes líquidos por mês,
// com barras empilhadas. Tocar (ou passar o mouse) numa coluna mostra os valores daquele mês.
import { useState } from "react";
import { ContributionFlowMonth, ContributionFlowPayload } from "@/types";
import { formatCurrency, monthLabel, monthName } from "@/lib/format";

// Altura em px (h-28). Barras em px, não %: em alguns WebViews a altura percentual dentro da coluna
// resolvia para zero (mesmo ajuste do desktop).
const CHART_HEIGHT = 112;

function monthTitle(item: { month: number; year: number }): string {
  const name = monthName(item.month);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}/${item.year}`;
}

function shortMonth(month: number): string {
  return monthLabel(month).replace(".", "").slice(0, 3);
}

function FlowBars({ months }: { months: ContributionFlowMonth[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((item) => item.income + Math.max(0, item.netContributions)));
  const hovered = active !== null ? months[active] : null;
  // Tooltip alinhado à coluna, sem sair do card nas pontas.
  const align =
    active === null ? "" : active < 4 ? "left-0" : active > months.length - 5 ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <div className="relative mt-4" onMouseLeave={() => setActive(null)}>
      <div className="flex items-end gap-1" style={{ height: `${CHART_HEIGHT}px` }}>
        {months.map((item, index) => {
          const incomeHeight = Math.round((item.income / max) * CHART_HEIGHT);
          const contributionHeight = Math.round((Math.max(0, item.netContributions) / max) * CHART_HEIGHT);
          const dimmed = active !== null && active !== index;
          return (
            <div
              role="button"
              tabIndex={0}
              key={`${item.year}-${item.month}`}
              aria-label={`${monthTitle(item)}: proventos ${formatCurrency(item.income)}, aportes líquidos ${formatCurrency(
                item.netContributions,
              )}, total ${formatCurrency(item.total)}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => setActive(active === index ? null : index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActive(active === index ? null : index);
                }
              }}
              className={`relative flex h-full flex-1 cursor-pointer flex-col justify-end rounded-t-sm outline-none transition-opacity ${
                item.inProgress ? "opacity-60" : ""
              } ${dimmed ? "opacity-40" : ""} ${active === index ? "ring-1 ring-slate-400/60" : ""}`}
            >
              <div className="w-full shrink-0 rounded-t-sm bg-indigo-400" style={{ height: `${contributionHeight}px` }} />
              <div className="w-full shrink-0 bg-emerald-400" style={{ height: `${incomeHeight}px` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {months.map((item, index) => (
          <span
            key={`${item.year}-${item.month}`}
            className={`flex-1 text-center text-[9px] ${active === index ? "font-semibold text-slate-200" : "text-slate-500"}`}
          >
            {shortMonth(item.month)}
            {item.inProgress ? "*" : ""}
          </span>
        ))}
      </div>

      {hovered ? (
        <div
          className={`pointer-events-none absolute bottom-full z-20 mb-2 min-w-[210px] rounded-lg border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs shadow-lg ${align}`}
        >
          <p className="mb-1 font-semibold text-slate-100">
            {monthTitle(hovered)}
            {hovered.inProgress ? <span className="ml-1 font-normal text-slate-400">(parcial)</span> : null}
          </p>
          <p className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
              Proventos
            </span>
            <span className="font-semibold text-emerald-300">{formatCurrency(hovered.income)}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="inline-block h-2 w-2 rounded-sm bg-indigo-400" />
              Aportes líquidos
            </span>
            <span className="font-semibold text-indigo-300">{formatCurrency(hovered.netContributions)}</span>
          </p>
          {hovered.withdrawals > 0 ? (
            <p className="text-right text-[10px] text-slate-500">
              aportes {formatCurrency(hovered.contributions)} − resgates {formatCurrency(hovered.withdrawals)}
            </p>
          ) : null}
          <p className="mt-1 flex justify-between gap-4 border-t border-slate-700 pt-1">
            <span className="text-slate-300">Total</span>
            <span className="font-bold text-slate-50">{formatCurrency(hovered.total)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SumLine({ income, net, total }: { income: number; net: number; total: number }) {
  return (
    <span className="text-slate-300">
      <span className="text-emerald-300">{formatCurrency(income)}</span>
      {" + "}
      <span className="text-indigo-300">{formatCurrency(net)}</span>
      {" = "}
      <span className="font-semibold text-slate-100">{formatCurrency(total)}</span>
    </span>
  );
}

export function ContributionFlowCard({ flow }: { flow: ContributionFlowPayload | undefined }) {
  if (!flow || flow.months.length === 0) return null;
  const current = flow.months[flow.months.length - 1];

  return (
    <section className="rounded-[1.5rem] border-2 border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-3.5 shadow-lg">
      <p className="card-title">Proventos e aportes (12M)</p>
      <p className="text-[11px] text-slate-500">Quanto entrou na carteira: proventos recebidos + aportes líquidos</p>
      <p className="card-value mt-1">{formatCurrency(flow.last12.total)}</p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
            Proventos
          </p>
          <p className="text-base font-semibold text-emerald-300">{formatCurrency(flow.last12.income)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block h-2 w-2 rounded-sm bg-indigo-400" />
            Aportes líquidos
          </p>
          <p className="text-base font-semibold text-indigo-300">{formatCurrency(flow.last12.netContributions)}</p>
          {flow.last12.withdrawals > 0 ? (
            <p className="text-[10px] text-slate-500">
              aportes {formatCurrency(flow.last12.contributions)} − resgates {formatCurrency(flow.last12.withdrawals)}
            </p>
          ) : null}
        </div>
      </div>

      <FlowBars months={flow.months} />

      <div className="mt-3 space-y-1.5 text-xs">
        <div>
          <p className="text-slate-400">No ano (YTD)</p>
          <SumLine income={flow.ytd.income} net={flow.ytd.netContributions} total={flow.ytd.total} />
        </div>
        <div>
          <p className="text-slate-400">Média mensal ({flow.averageMonths} meses fechados)</p>
          <SumLine
            income={flow.monthlyAverage.income}
            net={flow.monthlyAverage.netContributions}
            total={flow.monthlyAverage.total}
          />
        </div>
        <div>
          <p className="text-slate-400">
            {monthTitle(current)}
            {current.inProgress ? " (parcial)" : ""}
          </p>
          <SumLine income={current.income} net={current.netContributions} total={current.total} />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Barras: proventos (verde) e aportes líquidos (azul) de cada mês; toque numa coluna para ver os valores.
        {current.inProgress ? " * mês em andamento." : ""}
      </p>
    </section>
  );
}
