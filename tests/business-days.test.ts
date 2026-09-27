import { describe, expect, it } from "vitest";
import {
  countBusinessDaysBetween,
  countBusinessDaysElapsedInMonth,
  countBusinessDaysInMonth,
  isBusinessDay,
  previousBusinessDay,
} from "../lib/business-days";

const d = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

describe("business-days", () => {
  it("exclui fins de semana e feriados nacionais fixos", () => {
    expect(isBusinessDay(d("2026-09-07"))).toBe(false); // Independência (segunda-feira)
    expect(isBusinessDay(d("2026-09-05"))).toBe(false); // sábado
    expect(isBusinessDay(d("2026-09-08"))).toBe(true);
    expect(isBusinessDay(d("2026-12-25"))).toBe(false);
    expect(isBusinessDay(d("2026-11-20"))).toBe(false); // Consciência Negra
  });

  it("calcula a Sexta-feira Santa pela Páscoa", () => {
    expect(isBusinessDay(d("2026-04-03"))).toBe(false); // Páscoa em 05/04/2026
    expect(isBusinessDay(d("2025-04-18"))).toBe(false); // Páscoa em 20/04/2025
    expect(isBusinessDay(d("2026-04-02"))).toBe(true);
  });

  it("conta dias úteis do mês descontando feriados", () => {
    expect(countBusinessDaysInMonth(2026, 9)).toBe(21); // 22 dias de semana − 07/09
    expect(countBusinessDaysInMonth(2026, 8)).toBe(21);
    expect(countBusinessDaysInMonth(2026, 10)).toBe(21); // 22 dias de semana − 12/10
    expect(countBusinessDaysInMonth(2026, 11)).toBe(19); // 21 dias de semana − 02/11 − 20/11
  });

  it("conta dias úteis corridos até um dia do mês", () => {
    expect(countBusinessDaysElapsedInMonth(2026, 9, 8)).toBe(5); // 1,2,3,4 e 8
    expect(countBusinessDaysElapsedInMonth(2026, 9, 40)).toBe(21); // limita ao fim do mês
  });

  it("encontra o dia útil anterior pulando fim de semana e feriado", () => {
    expect(previousBusinessDay(d("2026-09-08"))).toEqual(d("2026-09-04")); // pula 07/09 e o fim de semana
    expect(previousBusinessDay(d("2026-09-27"))).toEqual(d("2026-09-25")); // domingo → sexta
    expect(previousBusinessDay(d("2026-09-16"))).toEqual(d("2026-09-15"));
  });

  it("conta dias úteis no intervalo (início exclusivo, fim inclusivo)", () => {
    expect(countBusinessDaysBetween(d("2026-09-25"), d("2026-09-30"))).toBe(3); // 28, 29 e 30
    expect(countBusinessDaysBetween(d("2026-09-04"), d("2026-09-08"))).toBe(1); // só 08
    expect(countBusinessDaysBetween(d("2026-09-30"), d("2026-09-30"))).toBe(0);
  });
});
