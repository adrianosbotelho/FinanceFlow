// Lançamento rápido de retornos: a partir do valor atual do mês (acumulado) e do novo valor
// informado, calcula a diferença, os dias úteis desde a data-base do último lançamento e o ganho
// por dia útil implícito, sinalizando valores fora do padrão. Função pura, usada no cliente.
import { countBusinessDaysBetween, previousBusinessDay } from "./business-days";

export type QuickEntryInput = {
  year: number;
  month: number;
  /** Valor acumulado já lançado no mês. */
  current: number;
  /** Data-base (aaaa-mm-dd) do último lançamento do mês; null se ainda não houve. */
  asOfDate: string | null;
  /** Ritmo recente por dia útil (lib/month-pace). */
  dailyRate: number;
  newValue: number | null;
  today: Date;
};

export type QuickEntryEvaluation = {
  delta: number | null;
  /** Data-base do novo lançamento: dia útil anterior a hoje, limitada ao fim do mês. */
  dataDate: Date;
  businessDays: number;
  impliedDaily: number | null;
  warnings: string[];
};

/** Tolerância para o ritmo implícito em relação ao ritmo recente (±50%). */
export const PACE_TOLERANCE = 0.5;

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export function quickEntryDataDate(year: number, month: number, today: Date): Date {
  const previous = previousBusinessDay(today);
  const monthEnd = new Date(year, month, 0);
  return previous.getTime() > monthEnd.getTime() ? monthEnd : previous;
}

export function evaluateQuickEntry(input: QuickEntryInput): QuickEntryEvaluation {
  const dataDate = quickEntryDataDate(input.year, input.month, input.today);
  const lastAsOf = input.asOfDate ? parseIso(input.asOfDate) : null;
  const lastAsOfInMonth =
    lastAsOf && lastAsOf.getFullYear() === input.year && lastAsOf.getMonth() + 1 === input.month ? lastAsOf : null;
  // Sem lançamento no mês, conta desde o início do mês.
  const from = lastAsOfInMonth ?? new Date(input.year, input.month - 1, 0);
  const businessDays = Math.max(0, countBusinessDaysBetween(from, dataDate));

  if (input.newValue === null || !Number.isFinite(input.newValue)) {
    return { delta: null, dataDate, businessDays, impliedDaily: null, warnings: [] };
  }

  const delta = input.newValue - input.current;
  const impliedDaily = businessDays > 0 ? delta / businessDays : null;
  const warnings: string[] = [];
  if (input.newValue < 0) warnings.push("Valor negativo.");
  if (delta < 0) warnings.push("Menor que o valor atual: a renda acumulada do mês não costuma cair.");
  if (businessDays === 0 && Math.abs(delta) > 0.004) {
    warnings.push("Mesma data-base do último lançamento: o valor será substituído.");
  }
  if (impliedDaily !== null && impliedDaily > 0 && input.dailyRate > 0) {
    const ratio = impliedDaily / input.dailyRate - 1;
    if (Math.abs(ratio) > PACE_TOLERANCE) {
      warnings.push(
        `Ritmo ${Math.round(Math.abs(ratio) * 100)}% ${ratio > 0 ? "acima" : "abaixo"} do usual por dia útil.`,
      );
    }
  }
  return { delta, dataDate, businessDays, impliedDaily, warnings };
}
