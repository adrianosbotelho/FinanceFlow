import { formatCurrencyBRL, formatPercentage } from "../../lib/formatters";

interface KPICardProps {
  label: string;
  value: number | null;
  variant?: "currency" | "percent";
  delta?: number | null;
  comparisonLabel?: string;
  /** Linha secundária (ex.: projeção do mês); o destaque continua sendo o valor real. */
  secondaryLabel?: string | null;
  secondaryDelta?: number | null;
}

export function KPICard({
  label,
  value,
  variant = "currency",
  delta,
  comparisonLabel = "vs período base",
  secondaryLabel = null,
  secondaryDelta = null,
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
  const borderClass =
    isPositive
      ? "border-emerald-500/60"
      : isNegative
        ? "border-rose-500/60"
        : "border-slate-700";

  const deltaLabel =
    delta === null || delta === undefined
      ? "–"
      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
  const deltaArrow =
    delta === null || delta === undefined
      ? ""
      : delta > 0
        ? "▲ "
        : delta < 0
          ? "▼ "
          : "• ";

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border bg-slate-800 p-5 shadow-sm transition-all hover:shadow-md ${borderClass}`}
    >
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
          {deltaArrow}
          {deltaLabel}
        </span>
        <span className="text-[11px] text-slate-500">{comparisonLabel}</span>
      </div>
      {secondaryLabel ? (
        <p className="text-[11px] text-slate-400">
          {secondaryLabel}
          {secondaryDelta !== null && secondaryDelta !== undefined ? (
            <span
              className={`ml-1 font-semibold ${
                secondaryDelta > 0 ? "text-success" : secondaryDelta < 0 ? "text-rose-400" : "text-slate-400"
              }`}
            >
              {`${secondaryDelta > 0 ? "+" : ""}${secondaryDelta.toFixed(1)}%`}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
