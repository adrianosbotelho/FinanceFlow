import { ReactNode } from "react";
import { formatCurrencyBRL, formatPercentage } from "../../lib/formatters";

interface KPICardProps {
  label: string;
  value: number | null;
  variant?: "currency" | "percent";
  delta?: number | null;
}

export function KPICard({
  label,
  value,
  variant = "currency",
  delta,
}: KPICardProps) {
  const isPositive = delta !== null && delta !== undefined && delta >= 0;
  const isNegative = delta !== null && delta !== undefined && delta < 0;

  const formattedValue =
    variant === "currency"
      ? formatCurrencyBRL(value ?? 0)
      : formatPercentage(value ?? 0);

  const deltaLabel =
    delta === null || delta === undefined
      ? "–"
      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;

  return (
    <div className="card flex flex-col gap-2 border border-slate-800 bg-surface/80 p-4 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-lg font-semibold text-slate-50 md:text-xl">
        {formattedValue}
      </span>
      <div className="mt-auto flex items-center gap-1 text-xs">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isPositive
              ? "bg-emerald-500/10 text-emerald-400"
              : isNegative
                ? "bg-rose-500/10 text-rose-400"
                : "bg-slate-700/60 text-slate-300"
          }`}
        >
          {isPositive && "↑"} {isNegative && "↓"} {deltaLabel}
        </span>
        <span className="text-[11px] text-slate-400">vs período base</span>
      </div>
    </div>
  );
}
