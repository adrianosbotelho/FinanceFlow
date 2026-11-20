// Card de destaque do Dashboard: renda do mês somada por instituição (todas as aplicações de renda
// fixa dela), comparada mês a mês. A instituição vem da configuração (FINANCEFLOW_DASHBOARD_INSTITUTION)
// ou, sem ela, é a que tem mais aplicações ativas (empate: maior renda no mês). Função pura.
import { CdbKpiEntry, InstitutionKpi } from "../types";

export type InstitutionKpiInvestment = {
  id: string;
  type: string;
  institution: string | null;
  amount_invested: number | string | null;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function pctVs(current: number, previous: number | null): number | null {
  return previous !== null && previous > 0 ? ((current - previous) / previous) * 100 : null;
}

export function buildInstitutionKpi(input: {
  cdbItems: CdbKpiEntry[];
  investments: InstitutionKpiInvestment[];
  /** Nome configurado da instituição (opcional). */
  preferred?: string | null;
  /** Mês em andamento: soma também as projeções por aplicação. */
  withProjection: boolean;
}): InstitutionKpi | null {
  const byId = new Map(input.investments.map((inv) => [inv.id, inv]));
  const groups = new Map<string, { institution: string; items: CdbKpiEntry[]; active: number }>();

  for (const item of input.cdbItems) {
    const inv = byId.get(item.investment_id);
    const institution = inv?.institution?.trim();
    if (!inv || inv.type !== "CDB" || !institution) continue;
    const key = normalize(institution);
    const group = groups.get(key) ?? { institution, items: [], active: 0 };
    group.items.push(item);
    const isActive = Number(inv.amount_invested ?? 0) > 0 || item.currentMonth > 0;
    if (isActive) group.active += 1;
    groups.set(key, group);
  }

  const candidates = Array.from(groups.values()).filter((group) => group.active > 0);
  if (candidates.length === 0) return null;

  const sum = (items: CdbKpiEntry[], pick: (item: CdbKpiEntry) => number) =>
    items.reduce((acc, item) => acc + pick(item), 0);

  const preferredKey = input.preferred ? normalize(input.preferred) : "";
  const chosen =
    (preferredKey ? candidates.find((group) => normalize(group.institution) === preferredKey) : undefined) ??
    candidates.sort(
      (a, b) => b.active - a.active || sum(b.items, (i) => i.currentMonth) - sum(a.items, (i) => i.currentMonth),
    )[0];

  const currentMonth = sum(chosen.items, (item) => item.currentMonth);
  // momDelta = atual − anterior; sem mês anterior em nenhuma aplicação, não há comparação.
  const hasPrevious = chosen.items.some((item) => item.momDelta !== null);
  const previousMonth = hasPrevious
    ? sum(chosen.items, (item) => (item.momDelta !== null ? item.currentMonth - item.momDelta : 0))
    : null;
  const projectedMonth = input.withProjection
    ? sum(chosen.items, (item) => item.projectedMonth ?? item.currentMonth)
    : null;

  return {
    institution: chosen.institution,
    investmentCount: chosen.items.length,
    labels: chosen.items.map((item) => item.label),
    currentMonth,
    previousMonth,
    momGrowth: pctVs(currentMonth, previousMonth),
    momDelta: previousMonth !== null ? currentMonth - previousMonth : null,
    projectedMonth,
    projectedMomGrowth: projectedMonth !== null ? pctVs(projectedMonth, previousMonth) : null,
  };
}
