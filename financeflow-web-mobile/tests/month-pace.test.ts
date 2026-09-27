import { describe, expect, it, vi } from "vitest";

// month-pace importa o cliente do Supabase (server-only); nos testes só a função pura é usada.
vi.mock("@/lib/supabase", () => ({ getSupabaseServerClient: () => ({}) }));

import { asOfDateForEntry, buildMonthPace, parseIsoDate, toIsoDate } from "@/lib/finance/month-pace";

// Carteira fictícia: um CDB que rende 5 por dia útil; setembro/2026 tem 21 dias úteis (07/09 é feriado).
const TODAY = parseIsoDate("2026-09-27"); // domingo
const investments = [
  { id: "cdb-a", type: "CDB" as const, institution: "Banco A", name: "CDB A", amount_invested: 10000 },
  { id: "sem-posicao", type: "FII" as const, institution: "B3", name: "FII encerrado", amount_invested: 0 },
];
const returns = [
  { investment_id: "cdb-a", year: 2025, month: 9, income_value: 84 },
  { investment_id: "cdb-a", year: 2026, month: 6, income_value: 105 },
  { investment_id: "cdb-a", year: 2026, month: 7, income_value: 115 },
  { investment_id: "cdb-a", year: 2026, month: 8, income_value: 105 },
  { investment_id: "cdb-a", year: 2026, month: 9, income_value: 90 },
  { investment_id: "sem-posicao", year: 2026, month: 5, income_value: 30 },
];
// Revisões: lançamento de 22/09 vale até 21/09; o de 26/09 (sábado) vale até 25/09.
const revisions = [
  { investment_id: "cdb-a", new_income_value: 70, created_at: "2026-09-22T13:00:00Z" },
  { investment_id: "cdb-a", new_income_value: 90, created_at: "2026-09-26T13:00:00Z" },
];

describe("data-base D−1", () => {
  it("o lançamento feito no dia D vale até o dia útil anterior", () => {
    expect(toIsoDate(asOfDateForEntry("2026-09-22T13:00:00Z"))).toBe("2026-09-21");
    expect(toIsoDate(asOfDateForEntry("2026-09-26T13:00:00Z"))).toBe("2026-09-25");
    expect(toIsoDate(asOfDateForEntry("2026-09-08T12:00:00Z"))).toBe("2026-09-04"); // pula o feriado de 07/09
  });
});

describe("buildMonthPace", () => {
  it("projeta o fechamento do mês em andamento pelo ganho diário das revisões", () => {
    const pace = buildMonthPace({ year: 2026, month: 9, today: TODAY, investments, returns, revisions });

    expect(pace.isCurrentMonth).toBe(true);
    expect(pace.asOfDate).toBe("2026-09-25");
    expect(pace.totalBusinessDays).toBe(21);
    expect(pace.elapsedBusinessDays).toBe(18);
    expect(pace.remainingBusinessDays).toBe(3);

    const [item] = pace.investments;
    expect(pace.investments).toHaveLength(1); // investimento sem posição fica fora
    expect(item.dailyRate).toBeCloseTo(5); // (90 − 70) / 4 dias úteis
    expect(item.projected).toBeCloseTo(105); // 90 + 5 × 3
    expect(pace.realized).toBeCloseTo(90);
    expect(pace.projected).toBeCloseTo(105);
  });

  it("compara com o mês anterior e com o mesmo mês do ano anterior", () => {
    const pace = buildMonthPace({ year: 2026, month: 9, today: TODAY, investments, returns, revisions });
    expect(pace.previousMonthTotal).toBeCloseTo(105);
    expect(pace.projectedVsPreviousPercent).toBeCloseTo(0);
    expect(pace.paceDeltaPercent).toBeCloseTo(0); // agosto e setembro têm 21 dias úteis
    expect(pace.yoyPercent).toBeCloseTo(25); // 105 vs 84
    expect(pace.expectedToDate).toBeCloseTo(90); // 5/dia útil × 18
    expect(pace.anomaly.detected).toBe(false);
    expect(pace.bestInvestment?.investmentId).toBe("cdb-a");
  });

  it("sem revisões usa a média do mês até a data-base D−1", () => {
    const pace = buildMonthPace({ year: 2026, month: 9, today: TODAY, investments, returns, revisions: [] });
    expect(pace.asOfDate).toBe("2026-09-25");
    expect(pace.investments[0].dailyRate).toBeCloseTo(5); // 90 / 18
    expect(pace.projected).toBeCloseTo(105);
  });

  it("mês fechado não é projetado", () => {
    const pace = buildMonthPace({ year: 2026, month: 8, today: TODAY, investments, returns, revisions: [] });
    expect(pace.isCurrentMonth).toBe(false);
    expect(pace.projected).toBeCloseTo(105);
    expect(pace.elapsedBusinessDays).toBe(pace.totalBusinessDays);
  });

  it("projeta a renda anual com o realizado do ano e o ritmo por dia útil", () => {
    const pace = buildMonthPace({ year: 2026, month: 9, today: TODAY, investments, returns, revisions });
    // realizado jun–ago (325) + setembro projetado (105) + 5/dia útil × dias úteis de out–dez
    const remainingBusinessDays = 21 + 19 + 22; // out (−12/10), nov (−02/11 e −20/11) e dez (−25/12)
    expect(pace.ytdRealized).toBeCloseTo(325 + 30); // inclui a renda antiga do investimento sem posição
    expect(pace.annualProjection).toBeCloseTo(355 + 105 + 5 * remainingBusinessDays);
  });
});
