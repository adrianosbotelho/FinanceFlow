// Validação das linhas importadas contra os dados existentes (funções puras; a rota busca os dados).
import { CashEventKind, ParsedCashEventRow, ParsedReturnRow, normalizeText } from "./import-parsers";

export type ImportInvestment = { id: string; name: string; institution: string };

export type ReturnImportStatus = "novo" | "atualiza" | "igual" | "fechado" | "erro";
export type CashEventImportStatus = "novo" | "duplicado" | "fechado" | "erro" | "ignorado";

export type ReturnImportRow = {
  line: number;
  investmentId: string | null;
  investmentLabel: string;
  year: number | null;
  month: number | null;
  value: number | null;
  previousValue: number | null;
  status: ReturnImportStatus;
  message: string | null;
};

export type CashEventImportRow = {
  line: number;
  investmentId: string | null;
  investmentLabel: string;
  date: string | null;
  type: CashEventKind | null;
  amount: number | null;
  description: string;
  status: CashEventImportStatus;
  message: string | null;
};

// Aceita o nome do investimento, "nome (instituição)" ou o id.
export function matchInvestment(raw: string | null, investments: ImportInvestment[]): ImportInvestment | null {
  if (!raw) return null;
  const text = normalizeText(raw);
  return (
    investments.find((inv) => inv.id === raw.trim()) ??
    investments.find((inv) => normalizeText(inv.name) === text) ??
    investments.find((inv) => normalizeText(`${inv.name} (${inv.institution})`) === text) ??
    null
  );
}

export function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

export function validateReturnRows(
  parsed: ParsedReturnRow[],
  investments: ImportInvestment[],
  existing: Map<string, number>, // `${investmentId}|${year}-${month}` → valor atual
  closedPeriods: Set<string>,
): ReturnImportRow[] {
  const seen = new Set<string>();
  return parsed.map((row) => {
    const investment = matchInvestment(row.investment, investments);
    const base = {
      line: row.line,
      investmentId: investment?.id ?? null,
      investmentLabel: investment ? investment.name : row.investment,
      year: row.year,
      month: row.month,
      value: row.value === null ? null : Math.round(row.value * 100) / 100,
      previousValue: null as number | null,
    };
    if (row.error) return { ...base, status: "erro" as const, message: row.error };
    if (!investment) return { ...base, status: "erro" as const, message: "Investimento não encontrado." };
    const key = `${investment.id}|${periodKey(row.year!, row.month!)}`;
    if (seen.has(key)) return { ...base, status: "erro" as const, message: "Linha repetida no arquivo." };
    seen.add(key);
    if (closedPeriods.has(periodKey(row.year!, row.month!))) {
      return { ...base, status: "fechado" as const, message: "Período fechado para edição." };
    }
    const previous = existing.get(key);
    if (previous === undefined) return { ...base, status: "novo" as const, message: null };
    if (Math.abs(previous - base.value!) < 0.005) {
      return { ...base, previousValue: previous, status: "igual" as const, message: "Já lançado com o mesmo valor." };
    }
    return { ...base, previousValue: previous, status: "atualiza" as const, message: null };
  });
}

export function validateCashEventRows(
  parsed: ParsedCashEventRow[],
  investments: ImportInvestment[],
  existing: Set<string>, // `${investmentId}|${date}|${type}|${amount}`
  closedPeriods: Set<string>,
  defaultInvestmentId: string | null,
): CashEventImportRow[] {
  const seen = new Set<string>();
  const fallback = defaultInvestmentId ? investments.find((inv) => inv.id === defaultInvestmentId) ?? null : null;
  return parsed.map((row) => {
    const investment = row.investment ? matchInvestment(row.investment, investments) : fallback;
    const base = {
      line: row.line,
      investmentId: investment?.id ?? null,
      investmentLabel: investment ? investment.name : row.investment ?? "—",
      date: row.date,
      type: row.type,
      amount: row.amount === null ? null : Math.round(row.amount * 100) / 100,
      description: row.description,
    };
    if (row.error) return { ...base, status: "erro" as const, message: row.error };
    if (!row.matched || !row.type) {
      return { ...base, status: "ignorado" as const, message: "Não parece aplicação nem resgate." };
    }
    if (!investment) return { ...base, status: "erro" as const, message: "Investimento não encontrado." };
    const [year, month] = row.date!.split("-").map(Number);
    const key = `${investment.id}|${row.date}|${row.type}|${base.amount!.toFixed(2)}`;
    if (existing.has(key) || seen.has(key)) {
      return { ...base, status: "duplicado" as const, message: "Evento já lançado." };
    }
    seen.add(key);
    if (closedPeriods.has(periodKey(year, month))) {
      return { ...base, status: "fechado" as const, message: "Período fechado para edição." };
    }
    return { ...base, status: "novo" as const, message: null };
  });
}

export function cashEventKey(investmentId: string, date: string, type: string, amount: number): string {
  return `${investmentId}|${date}|${type}|${(Math.round(amount * 100) / 100).toFixed(2)}`;
}
