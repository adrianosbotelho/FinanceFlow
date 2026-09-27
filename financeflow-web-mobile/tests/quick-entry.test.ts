import { describe, expect, it } from "vitest";
import { evaluateQuickEntry, quickEntryDataDate } from "@/lib/finance/quick-entry";

// Valores fictícios. Segunda, 15/06/2026 → data-base sexta, 12/06/2026.
const today = new Date(2026, 5, 15);
const base = { year: 2026, month: 6, current: 400, asOfDate: "2026-06-08", dailyRate: 50, today };

describe("quick-entry", () => {
  it("usa o dia útil anterior como data-base, limitado ao fim do mês", () => {
    expect(quickEntryDataDate(2026, 6, today).getDate()).toBe(12);
    const closing = quickEntryDataDate(2026, 5, today);
    expect(closing.getMonth() + 1).toBe(5);
    expect(closing.getDate()).toBe(31);
  });

  it("calcula diferença, dias úteis desde o último lançamento e ritmo implícito", () => {
    const result = evaluateQuickEntry({ ...base, newValue: 600 });
    expect(result.delta).toBe(200);
    expect(result.businessDays).toBe(4); // 09 a 12/06
    expect(result.impliedDaily).toBe(50);
    expect(result.warnings).toEqual([]);
  });

  it("sem lançamento no mês conta desde o início do mês", () => {
    const result = evaluateQuickEntry({ ...base, current: 0, asOfDate: null, newValue: 500 });
    expect(result.businessDays).toBe(10);
    expect(result.impliedDaily).toBe(50);
  });

  it("ignora data-base de outro mês", () => {
    const result = evaluateQuickEntry({ ...base, current: 0, asOfDate: "2026-05-29", newValue: 500 });
    expect(result.businessDays).toBe(10);
  });

  it("sinaliza valor menor que o atual", () => {
    const result = evaluateQuickEntry({ ...base, newValue: 350 });
    expect(result.warnings.some((w) => w.includes("Menor que o valor atual"))).toBe(true);
  });

  it("sinaliza ritmo muito fora do usual", () => {
    const high = evaluateQuickEntry({ ...base, newValue: 800 }); // 100/dia vs 50
    expect(high.warnings.some((w) => w.includes("acima"))).toBe(true);
    const low = evaluateQuickEntry({ ...base, newValue: 480 }); // 20/dia vs 50
    expect(low.warnings.some((w) => w.includes("abaixo"))).toBe(true);
  });

  it("sinaliza mesma data-base", () => {
    const result = evaluateQuickEntry({ ...base, asOfDate: "2026-06-12", newValue: 450 });
    expect(result.businessDays).toBe(0);
    expect(result.impliedDaily).toBeNull();
    expect(result.warnings.some((w) => w.includes("Mesma data-base"))).toBe(true);
  });

  it("sem novo valor não calcula nada", () => {
    const result = evaluateQuickEntry({ ...base, newValue: null });
    expect(result.delta).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});
