// "O que fazer agora" (Insights): onde colocar o próximo aporte e o que conferir. Funções puras.
// O próximo aporte é escolhido pela taxa (% do CDI contratado; sem cadastro, o realizado no mês),
// respeitando a folga do FGC por instituição e desempatando pela liquidez.
import { countBusinessDaysBetween } from "./business-days";
import { parseLiquidity } from "./redemption-tax";

export const FGC_LIMIT = 250_000;
/** Folga mínima no FGC para sugerir aporte numa instituição. */
export const MIN_FGC_HEADROOM = 1_000;
/** Diferença (p.p. do CDI) entre realizado e contratado que vira verificação. */
export const BELOW_CONTRACT_TOLERANCE = 5;
/** Dias úteis de atraso do último lançamento (vs data-base) que viram verificação. */
export const STALE_BUSINESS_DAYS = 2;

export type AporteCandidate = {
  id: string;
  label: string;
  institution: string;
  balance: number;
  contractedCdiPercent: number | null;
  realizedPercentOfCdi: number | null;
  liquidity: string | null;
};

export type RankedAporteCandidate = AporteCandidate & {
  rate: number | null;
  rateSource: "contratado" | "realizado" | null;
  fgcHeadroom: number;
  liquidityLabel: string;
  eligible: boolean;
  notes: string[];
};

export function normalizeInstitution(value: string): string {
  return value.trim().toLowerCase();
}

function liquidityRank(value: string | null): number {
  const parsed = parseLiquidity(value);
  if (parsed.kind === "diaria") return 0;
  if (parsed.kind === "prazo") return 1 + (parsed.days ?? 0) / 1000;
  if (parsed.kind === "vencimento") return 3;
  return 2;
}

function liquidityLabel(value: string | null): string {
  const parsed = parseLiquidity(value);
  if (parsed.kind === "diaria") return "liquidez diária";
  if (parsed.kind === "prazo") return `liquidez D+${parsed.days}`;
  if (parsed.kind === "vencimento") return "liquidez no vencimento";
  return "liquidez não informada";
}

export function institutionBalances(candidates: Array<{ institution: string; balance: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of candidates) {
    const key = normalizeInstitution(item.institution);
    map.set(key, (map.get(key) ?? 0) + Math.max(0, item.balance));
  }
  return map;
}

export function rankAporteCandidates(candidates: AporteCandidate[], fgcLimit = FGC_LIMIT): RankedAporteCandidate[] {
  const byInstitution = institutionBalances(candidates);
  const ranked = candidates.map((item) => {
    const rate = item.contractedCdiPercent ?? item.realizedPercentOfCdi;
    const rateSource: RankedAporteCandidate["rateSource"] =
      item.contractedCdiPercent !== null ? "contratado" : item.realizedPercentOfCdi !== null ? "realizado" : null;
    const fgcHeadroom = fgcLimit - (byInstitution.get(normalizeInstitution(item.institution)) ?? 0);
    const notes: string[] = [];
    if (rate === null) notes.push("sem taxa cadastrada nem histórico no mês");
    if (fgcHeadroom < MIN_FGC_HEADROOM) notes.push("sem folga no FGC da instituição");
    return {
      ...item,
      rate,
      rateSource,
      fgcHeadroom,
      liquidityLabel: liquidityLabel(item.liquidity),
      eligible: rate !== null && fgcHeadroom >= MIN_FGC_HEADROOM,
      notes,
    };
  });
  return ranked.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      (b.rate ?? -1) - (a.rate ?? -1) ||
      liquidityRank(a.liquidity) - liquidityRank(b.liquidity) ||
      b.fgcHeadroom - a.fgcHeadroom,
  );
}

export type InsightCheck = {
  id: string;
  severity: "high" | "medium";
  title: string;
  detail: string;
};

export function buildInsightChecks(input: {
  benchmark: Array<{ key: string; label: string; percentOfCdi: number | null; contractedCdiPercent: number | null }>;
  pace: Array<{ investmentId: string; label: string; realized: number; asOfDate: string | null }>;
  /** Data-base (aaaa-mm-dd) do mês em andamento; null quando o mês está fechado. */
  dataBaseIso: string | null;
  institutions: Array<{ institution: string; balance: number }>;
  fgcLimit?: number;
}): InsightCheck[] {
  const checks: InsightCheck[] = [];
  const fgcLimit = input.fgcLimit ?? FGC_LIMIT;

  for (const item of input.benchmark) {
    if (item.percentOfCdi === null || item.contractedCdiPercent === null) continue;
    const gap = item.contractedCdiPercent - item.percentOfCdi;
    if (gap > BELOW_CONTRACT_TOLERANCE) {
      checks.push({
        id: `below-${item.key}`,
        severity: gap > 15 ? "high" : "medium",
        title: `${item.label} abaixo da taxa contratada`,
        detail: `Rendeu ${Math.round(item.percentOfCdi)}% do CDI no mês, contra ${Math.round(
          item.contractedCdiPercent,
        )}% contratado. Confira os lançamentos, aportes/resgates do mês e a taxa no cadastro.`,
      });
    }
  }

  if (input.dataBaseIso) {
    const [year, month, day] = input.dataBaseIso.split("-").map(Number);
    const dataBase = new Date(year, month - 1, day);
    for (const item of input.pace) {
      if (!item.asOfDate || item.realized <= 0) continue;
      const [y, m, d] = item.asOfDate.split("-").map(Number);
      const asOf = new Date(y, m - 1, d);
      const lag = asOf < dataBase ? countBusinessDaysBetween(asOf, dataBase) : 0;
      if (lag >= STALE_BUSINESS_DAYS) {
        checks.push({
          id: `stale-${item.investmentId}`,
          severity: "medium",
          title: `${item.label} com lançamento atrasado`,
          detail: `Dados até ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} (${lag} dias úteis antes da data-base). Atualize em Retornos Mensais.`,
        });
      }
    }
  }

  const balances = new Map<string, { label: string; balance: number }>();
  for (const item of input.institutions) {
    const key = normalizeInstitution(item.institution);
    const current = balances.get(key) ?? { label: item.institution.trim(), balance: 0 };
    current.balance += Math.max(0, item.balance);
    balances.set(key, current);
  }
  for (const [key, item] of Array.from(balances.entries())) {
    if (item.balance > fgcLimit) {
      checks.push({
        id: `fgc-${key}`,
        severity: "high",
        title: `${item.label} acima do limite do FGC`,
        detail: `O saldo na instituição passa do limite de garantia por CPF; o excedente não é coberto.`,
      });
    }
  }

  return checks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
