export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "–";
  }
  return `${value.toFixed(1)}%`;
}

export function monthLabel(month: number): string {
  const base = new Date(2024, month - 1, 1);
  return base.toLocaleDateString("pt-BR", { month: "short" }).toUpperCase();
}

export function monthNameFull(month: number): string {
  const base = new Date(2024, month - 1, 1);
  return base.toLocaleDateString("pt-BR", { month: "long" });
}
