export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
}

export const NAV_ORDER_STORAGE_KEY = "financeflow.nav.order.v1";

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Dash" },
  { href: "/insights", label: "Insights Financeiros", shortLabel: "Insig" },
  { href: "/health", label: "Health Check", shortLabel: "Health" },
  { href: "/performance", label: "Performance", shortLabel: "Perf" },
  { href: "/goals", label: "Metas", shortLabel: "Metas" },
  { href: "/investments", label: "Investimentos", shortLabel: "Assets" },
  { href: "/returns", label: "Retornos Mensais", shortLabel: "Ret" },
];

export function resolveNavItems(savedOrder: string[] | null | undefined): NavItem[] {
  if (!savedOrder || savedOrder.length === 0) {
    return DEFAULT_NAV_ITEMS;
  }

  const byHref = new Map(DEFAULT_NAV_ITEMS.map((item) => [item.href, item]));
  const ordered: NavItem[] = [];
  const used = new Set<string>();

  for (const href of savedOrder) {
    if (used.has(href)) continue;
    const item = byHref.get(href);
    if (!item) continue;
    ordered.push(item);
    used.add(href);
  }

  for (const item of DEFAULT_NAV_ITEMS) {
    if (!used.has(item.href)) {
      ordered.push(item);
    }
  }

  return ordered;
}
