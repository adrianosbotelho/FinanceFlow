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
  const numericValue = value ?? 0;
  const isPositive = delta !== null && delta !== undefined && delta >= 0;
  const isNegative = delta !== null && delta !== undefined && delta < 0;

  const formattedValue =
    variant === "currency"
      ? formatCurrencyBRL(numericValue)
      : formatPercentage(numericValue);

  const valueClass =
    isPositive
      ? "text-emerald-400"
      : isNegative
        ? "text-rose-400"
        : "text-slate-50";

  const deltaLabel =
    delta === null || delta === undefined
      ? "–"
      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md">
      <span className="text-sm font-medium text-slate-500">
        {label}
      </span>
      <span className={`text-2xl font-extrabold tracking-tight ${valueClass}`}>
        {formattedValue}
      </span>
      <div className="mt-auto flex items-center gap-1 text-xs">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm font-semibold ${
            isPositive
              ? "text-success"
              : isNegative
                ? "text-rose-400"
                : "text-slate-400"
          }`}
        >
          {deltaLabel}
        </span>
        <span className="text-[11px] text-slate-500">vs período base</span>
      </div>
    </div>
  );
}
