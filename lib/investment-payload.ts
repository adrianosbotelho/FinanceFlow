import { InvestmentType } from "../types";

export type InvestmentPayload = {
  type: InvestmentType;
  institution: string;
  name: string;
  amount_invested: number;
  cdi_rate?: number | null;
  benchmark?: string | null;
  start_date?: string | null;
  liquidity?: string | null;
  maturity_date?: string | null;
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function parseOptionalDate(value: unknown, label: string): { value: string | null } | { error: string } {
  if (isEmpty(value)) return { value: null };
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  if (!match || !date || date.getMonth() + 1 !== Number(match[2])) {
    return { error: `${label} inválida. Use o formato AAAA-MM-DD.` };
  }
  return { value: text };
}

function parseOptionalText(value: unknown, label: string, maxLength: number): { value: string | null } | { error: string } {
  if (isEmpty(value)) return { value: null };
  const text = String(value).trim();
  if (text.length > maxLength) return { error: `${label} deve ter no máximo ${maxLength} caracteres.` };
  return { value: text };
}

// Valida o corpo de criação/edição de investimento. Campos opcionais só entram no payload se vierem
// no corpo (vazio = null), para não apagar valores em edições parciais.
export function normalizeInvestmentPayload(body: unknown): { data: InvestmentPayload } | { error: string } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const type = input.type as InvestmentType;
  const institution = String(input.institution ?? "").trim();
  const name = String(input.name ?? "").trim();
  const amountInvested = Number(input.amount_invested);

  if (type !== "CDB" && type !== "FII") {
    return { error: "Tipo inválido. Use CDB ou FII." };
  }
  if (!institution) {
    return { error: "Instituição é obrigatória." };
  }
  if (!name) {
    return { error: "Nome é obrigatório." };
  }
  if (!Number.isFinite(amountInvested) || amountInvested < 0) {
    return { error: "Valor investido inválido." };
  }

  const data: InvestmentPayload = { type, institution, name, amount_invested: amountInvested };

  if ("cdi_rate" in input) {
    if (isEmpty(input.cdi_rate)) {
      data.cdi_rate = null;
    } else {
      const cdiRate = Number(String(input.cdi_rate).replace(",", "."));
      if (!Number.isFinite(cdiRate) || cdiRate <= 0 || cdiRate > 500) {
        return { error: "% do CDI inválido. Informe um valor entre 0 e 500 (ex.: 100 ou 120)." };
      }
      data.cdi_rate = Math.round(cdiRate * 100) / 100;
    }
  }
  if ("benchmark" in input) {
    const parsed = parseOptionalText(input.benchmark, "Benchmark", 100);
    if ("error" in parsed) return parsed;
    data.benchmark = parsed.value;
  }
  if ("liquidity" in input) {
    const parsed = parseOptionalText(input.liquidity, "Liquidez", 100);
    if ("error" in parsed) return parsed;
    data.liquidity = parsed.value;
  }
  if ("start_date" in input) {
    const parsed = parseOptionalDate(input.start_date, "Data de início");
    if ("error" in parsed) return parsed;
    data.start_date = parsed.value;
  }
  if ("maturity_date" in input) {
    const parsed = parseOptionalDate(input.maturity_date, "Data de vencimento");
    if ("error" in parsed) return parsed;
    data.maturity_date = parsed.value;
  }
  if (data.start_date && data.maturity_date && data.maturity_date < data.start_date) {
    return { error: "A data de vencimento deve ser posterior à data de início." };
  }

  return { data };
}
