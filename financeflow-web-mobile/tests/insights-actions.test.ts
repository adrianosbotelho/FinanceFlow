import { describe, expect, it } from "vitest";
import { buildInsightChecks, rankAporteCandidates } from "@/lib/finance/insights-actions";

// Carteira fictícia.
const candidates = [
  { id: "a", label: "CDB A", institution: "Banco A", balance: 100_000, contractedCdiPercent: 100, realizedPercentOfCdi: 98, liquidity: "Diária" },
  { id: "b", label: "Caixinha B", institution: "Banco B", balance: 5_000, contractedCdiPercent: 120, realizedPercentOfCdi: 125, liquidity: "Diária" },
  { id: "c", label: "CDB C", institution: "banco b", balance: 246_000, contractedCdiPercent: 110, realizedPercentOfCdi: 110, liquidity: "No vencimento" },
  { id: "d", label: "CDB D", institution: "Banco D", balance: 10_000, contractedCdiPercent: null, realizedPercentOfCdi: 103, liquidity: "D+30" },
  { id: "e", label: "CDB E", institution: "Banco E", balance: 10_000, contractedCdiPercent: 100, realizedPercentOfCdi: null, liquidity: "D+30" },
];

describe("rankAporteCandidates", () => {
  it("ordena pela taxa, só com folga no FGC (soma por instituição, sem diferenciar maiúsculas)", () => {
    const ranked = rankAporteCandidates(candidates);
    // Banco B soma 251 mil: sem folga, Caixinha B e CDB C vão para o fim.
    expect(ranked.map((item) => item.id)).toEqual(["d", "a", "e", "b", "c"]);
    expect(ranked.find((item) => item.id === "b")?.eligible).toBe(false);
    expect(ranked.find((item) => item.id === "b")?.notes).toContain("sem folga no FGC da instituição");
  });

  it("usa a taxa contratada e, sem ela, o realizado", () => {
    const ranked = rankAporteCandidates(candidates);
    expect(ranked.find((item) => item.id === "d")?.rateSource).toBe("realizado");
    expect(ranked.find((item) => item.id === "a")?.rate).toBe(100);
  });

  it("desempata pela liquidez", () => {
    const ranked = rankAporteCandidates([
      { ...candidates[4], id: "x", liquidity: "No vencimento" },
      { ...candidates[4], id: "y", institution: "Banco Y", liquidity: "Diária" },
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["y", "x"]);
    expect(ranked[0].liquidityLabel).toBe("liquidez diária");
  });
});

describe("buildInsightChecks", () => {
  it("aponta rendimento abaixo do contratado, lançamento atrasado e FGC estourado", () => {
    const checks = buildInsightChecks({
      benchmark: [
        { key: "a", label: "CDB A", percentOfCdi: 91, contractedCdiPercent: 100 },
        { key: "b", label: "CDB B", percentOfCdi: 98, contractedCdiPercent: 100 },
        { key: "c", label: "CDB C", percentOfCdi: 80, contractedCdiPercent: null },
      ],
      pace: [
        { investmentId: "a", label: "CDB A", realized: 100, asOfDate: "2026-06-12" },
        { investmentId: "b", label: "CDB B", realized: 100, asOfDate: "2026-06-09" },
      ],
      dataBaseIso: "2026-06-12",
      institutions: candidates,
    });
    expect(checks.map((check) => check.id)).toEqual(["fgc-banco b", "below-a", "stale-b"]);
    expect(checks.find((check) => check.id === "stale-b")?.detail).toContain("3 dias úteis");
  });

  it("sem data-base (mês fechado) não aponta atraso", () => {
    const checks = buildInsightChecks({
      benchmark: [],
      pace: [{ investmentId: "b", label: "CDB B", realized: 100, asOfDate: "2026-06-01" }],
      dataBaseIso: null,
      institutions: [],
    });
    expect(checks).toEqual([]);
  });
});
