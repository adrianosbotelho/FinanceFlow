import { describe, expect, it } from "vitest";
import { buildInstitutionKpi } from "../lib/institution-kpi";
import { CdbKpiEntry } from "../types";

// Dados fictícios.
const investments = [
  { id: "a1", type: "CDB", institution: "Banco Alfa", amount_invested: 1000 },
  { id: "a2", type: "CDB", institution: "Banco Alfa ", amount_invested: 2000 },
  { id: "b1", type: "CDB", institution: "Banco Beta", amount_invested: 5000 },
  { id: "c1", type: "CDB", institution: "Banco Gama", amount_invested: 0 },
  { id: "f1", type: "FII", institution: "Banco Beta", amount_invested: 0 },
];

function item(id: string, current: number, delta: number | null, projected?: number): CdbKpiEntry {
  return {
    investment_id: id,
    label: `Aplicação ${id}`,
    currentMonth: current,
    momGrowth: null,
    momDelta: delta,
    projectedMonth: projected,
  };
}

const cdbItems = [item("a1", 10, 2, 15), item("a2", 20, -5, 30), item("b1", 50, 10, 70), item("c1", 0, -8)];

describe("institution-kpi", () => {
  it("escolhe a instituição com mais aplicações ativas e soma o mês", () => {
    const kpi = buildInstitutionKpi({ cdbItems, investments, withProjection: false });
    expect(kpi).toMatchObject({
      institution: "Banco Alfa",
      investmentCount: 2,
      currentMonth: 30,
      previousMonth: 33,
      momDelta: -3,
      projectedMonth: null,
      projectedMomGrowth: null,
    });
    expect(kpi?.momGrowth).toBeCloseTo((-3 / 33) * 100, 6);
  });

  it("respeita a instituição configurada (sem diferenciar acento/maiúsculas)", () => {
    const kpi = buildInstitutionKpi({ cdbItems, investments, preferred: "banco beta", withProjection: true });
    expect(kpi).toMatchObject({ institution: "Banco Beta", currentMonth: 50, previousMonth: 40, projectedMonth: 70 });
    expect(kpi?.projectedMomGrowth).toBeCloseTo(75, 6);
  });

  it("ignora configuração de instituição sem aplicação ativa e soma projeções", () => {
    const kpi = buildInstitutionKpi({ cdbItems, investments, preferred: "Banco Gama", withProjection: true });
    expect(kpi?.institution).toBe("Banco Alfa");
    expect(kpi?.projectedMonth).toBe(45);
  });

  it("sem mês anterior não há variação", () => {
    const kpi = buildInstitutionKpi({
      cdbItems: [item("a1", 10, null), item("a2", 20, null)],
      investments,
      withProjection: false,
    });
    expect(kpi).toMatchObject({ previousMonth: null, momGrowth: null, momDelta: null });
  });

  it("sem aplicações ativas devolve null", () => {
    expect(buildInstitutionKpi({ cdbItems: [item("c1", 0, null)], investments, withProjection: false })).toBeNull();
  });
});
