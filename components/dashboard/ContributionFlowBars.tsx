"use client";

// Barras empilhadas do card "Proventos e aportes": ao passar o mouse (ou tocar) numa coluna,
// mostra proventos, aportes líquidos e o total do mês. Tooltip próprio porque o `title` nativo
// não aparece de forma confiável no app Electron.
import { useState } from "react";
import { ContributionFlowMonth } from "../../types";
import { formatCurrencyBRL, monthLabel } from "../../lib/formatters";

// Altura do gráfico em px (h-28). As barras usam px, não %: no Chromium do app (Electron 28),
// altura percentual dentro de <button> resolvia para zero e as colunas sumiam.
const CHART_HEIGHT = 112;

export function ContributionFlowBars({ months }: { months: ContributionFlowMonth[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((item) => item.income + Math.max(0, item.netContributions)));
  const hovered = active !== null ? months[active] : null;
  // Tooltip alinhado à coluna, sem sair do card nas pontas.
  const align = active === null ? "" : active < 3 ? "left-0" : active > months.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2";

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
              aria-label={`${monthLabel(item.month)}/${item.year}: proventos ${formatCurrencyBRL(item.income)}, aportes líquidos ${formatCurrencyBRL(
                item.netContributions,
              )}, total ${formatCurrencyBRL(item.total)}`}
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
            {monthLabel(item.month).slice(0, 3)}
            {item.inProgress ? "*" : ""}
          </span>
        ))}
      </div>

      {hovered ? (
        <div
          className={`pointer-events-none absolute bottom-full z-20 mb-2 min-w-[210px] rounded-lg border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs shadow-lg ${align}`}
        >
          <p className="mb-1 font-semibold text-slate-100">
            {monthLabel(hovered.month)}/{hovered.year}
            {hovered.inProgress ? <span className="ml-1 font-normal text-slate-400">(parcial)</span> : null}
          </p>
          <p className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
              Proventos
            </span>
            <span className="font-semibold text-emerald-300">{formatCurrencyBRL(hovered.income)}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="inline-block h-2 w-2 rounded-sm bg-indigo-400" />
              Aportes líquidos
            </span>
            <span className="font-semibold text-indigo-300">{formatCurrencyBRL(hovered.netContributions)}</span>
          </p>
          {hovered.withdrawals > 0 ? (
            <p className="text-right text-[10px] text-slate-500">
              aportes {formatCurrencyBRL(hovered.contributions)} − resgates {formatCurrencyBRL(hovered.withdrawals)}
            </p>
          ) : null}
          <p className="mt-1 flex justify-between gap-4 border-t border-slate-700 pt-1">
            <span className="text-slate-300">Total</span>
            <span className="font-bold text-slate-50">{formatCurrencyBRL(hovered.total)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
