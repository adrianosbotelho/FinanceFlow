export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function monthLabel(month: number): string {
  const d = new Date(2024, month - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short" }).toUpperCase();
}

export function monthName(month: number): string {
  const d = new Date(2024, month - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long" });
}
