import { describe, expect, it } from "vitest";
import { buildBalanceContexts } from "../lib/balance-history";
import { countBusinessDaysInMonth } from "../lib/business-days";
import { buildDailyIncome } from "../lib/daily-income";

// Carteira fictícia. Dias úteis de 2026: mar 22, abr 20, mai 20; de 16/03 a 31/03 = 11;
// junho até 12/06 (D−1 de 15/06) = 10.
const investments = [
  // Aplicação de 10.000 em 16/03, aporte de 2.000 em maio.
  { id: "cdb-a", type: "CDB", institution: "Banco A", name: "CDB A", amount_invested: 12324 },
  // Sem start_date: estreia em abril fica parcial.
  { id: "cdb-b", type: "CDB", institution: "Banco B", name: "CDB B", amount_invested: 5100 },
  // Encerrado em fevereiro.
  { id: "cdb-c", type: "CDB", institution: "Banco C", name: "CDB C", amount_invested: 0 },
  { id: "fii-x", type: "FII", institution: "B3", name: "FII X", amount_invested: 1000 },
];
const returns = [
  { investment_id: "cdb-a", year: 2026, month: 3, income_value: 44 },
  { investment_id: "cdb-a", year: 2026, month: 4, income_value: 100 },
  { investment_id: "cdb-a", year: 2026, month: 5, income_value: 120 },
  { investment_id: "cdb-a", year: 2026, month: 6, income_value: 60 },
  { investment_id: "cdb-b", year: 2026, month: 4, income_value: 20 },
  { investment_id: "cdb-b", year: 2026, month: 5, income_value: 40 },
  { investment_id: "cdb-b", year: 2026, month: 6, income_value: 20 },
  { investment_id: "cdb-c", year: 2026, month: 1, income_value: 30 },
  { investment_id: "cdb-c", year: 2026, month: 2, income_value: 30 },
  { investment_id: "fii-x", year: 2026, month: 5, income_value: 9 },
];
const cashEvents = [{ investment_id: "cdb-a", year: 2026, month: 5, type: "APORTE", amount: 2000 }];
const contexts = buildBalanceContexts(investments, returns, cashEvents);
const startDateById = new Map<string, string | null>([["cdb-a", "2026-03-16"]]);

function build(year = 2026) {
  return buildDailyIncome({ contexts, startDateById, year, today: new Date(2026, 5, 15) });
}

describe("daily-income", () => {
  it("vai até o mês da data-base e ignora FIIs", () => {
    const result = build();
    expect(result.months).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.dataThroughISO).toBe("2026-06-12");
    expect(result.series.map((item) => item.investmentId)).toEqual(["cdb-a", "cdb-b", "cdb-c"]);
  });

  it("divide a renda pelos dias úteis em que o investimento rendeu", () => {
    const a = build().series[0];
    expect(a.points[0]).toBeNull();
    expect(a.points[1]).toBeNull();
    const [mar, apr, may, jun] = a.points.slice(2);
    expect(mar?.businessDays).toBe(11); // desde start_date
    expect(mar?.dailyIncome).toBeCloseTo(4, 6);
    expect(mar?.partialDebut).toBe(false);
    expect(apr?.dailyIncome).toBeCloseTo(5, 6);
    expect(may?.dailyIncome).toBeCloseTo(6, 6);
    expect(jun?.status).toBe("in_progress");
    expect(jun?.businessDays).toBe(10);
    expect(jun?.dailyIncome).toBeCloseTo(6, 6);
  });

  it("calcula o ganho por R$ 10 mil sobre o capital que rendeu", () => {
    const [mar, apr, may] = build().series[0].points.slice(2);
    expect(mar?.balanceBase).toBeCloseTo(10000, 6);
    expect(mar?.dailyPer10k).toBeCloseTo(4, 6);
    expect(apr?.balanceBase).toBeCloseTo(10044, 6);
    // Maio: abertura 10.144 + metade do aporte de 2.000.
    expect(may?.balanceBase).toBeCloseTo(11144, 6);
    expect(may?.dailyPer10k).toBeCloseTo((6 / 11144) * 10000, 6);
  });

  it("variações mês a mês e no ano só entre meses comparáveis", () => {
    const a = build().series[0];
    const [mar, apr, may, jun] = a.points.slice(2);
    expect(mar?.changePercent).toBeNull();
    expect(apr?.changePercent).toBeCloseTo(25, 6);
    expect(may?.changePercent).toBeCloseTo(20, 6);
    expect(jun?.changePercent).toBeCloseTo(0, 6);
    expect(a.fromMonth).toBe(3);
    expect(a.toMonth).toBe(5);
    expect(a.yearChangePercent).toBeCloseTo(50, 6);
  });

  it("estreia sem start_date fica parcial e fora das variações", () => {
    const b = build().series[1];
    const [apr, may] = b.points.slice(3);
    expect(apr?.partialDebut).toBe(true);
    expect(may?.changePercent).toBeNull();
    expect(b.yearChangePercent).toBeNull();
  });

  it("investimento encerrado some a partir do mês sem saldo nem renda", () => {
    const c = build().series[2];
    expect(c.points[0]?.businessDays).toBe(countBusinessDaysInMonth(2026, 1));
    expect(c.points[2]).toBeNull();
  });

  it("mês em andamento vai até a data-base do último lançamento do investimento", () => {
    const result = buildDailyIncome({
      contexts,
      startDateById,
      lastAsOfById: new Map([["cdb-a", new Date(2026, 5, 5)]]),
      year: 2026,
      today: new Date(2026, 5, 15),
    });
    const jun = result.series[0].points[5];
    expect(jun?.businessDays).toBe(5); // 01/06 a 05/06
    expect(jun?.dailyIncome).toBeCloseTo(12, 6);
  });

  it("total soma os ganhos diários do mês", () => {
    const total = build().total;
    expect(total[4]?.dailyIncome).toBeCloseTo(6 + 2, 6);
    expect(total[5]?.status).toBe("in_progress");
  });

  it("ano futuro não tem meses; ano passado tem os 12", () => {
    expect(build(2027).months).toEqual([]);
    expect(build(2025).months).toHaveLength(12);
    expect(build(2025).series).toHaveLength(0);
  });
});
