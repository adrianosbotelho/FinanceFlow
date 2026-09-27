import { describe, expect, it } from "vitest";
import {
  classifyOfxTransactions,
  parseBrNumber,
  parseCashEventType,
  parseCashEventsCsv,
  parseCompetence,
  parseCsv,
  parseFlexibleDate,
  parseOfx,
  parseReturnsCsv,
} from "../lib/import-parsers";
import { matchInvestment, validateCashEventRows, validateReturnRows } from "../lib/import-validation";

const INVESTMENTS = [
  { id: "id-a", name: "CDB Alfa", institution: "Banco Um" },
  { id: "id-b", name: "CDB Beta", institution: "Banco Dois" },
];

describe("parsers básicos", () => {
  it("lê CSV com ; e aspas", () => {
    const table = parseCsv('﻿Investimento;Valor\n"CDB; Alfa";"1.234,56"\n');
    expect(table.headers).toEqual(["investimento", "valor"]);
    expect(table.rows).toEqual([["CDB; Alfa", "1.234,56"]]);
  });

  it("detecta vírgula como separador", () => {
    expect(parseCsv("a,b\n1,2").rows).toEqual([["1", "2"]]);
  });

  it("interpreta números no padrão brasileiro e internacional", () => {
    expect(parseBrNumber("1.234,56")).toBeCloseTo(1234.56);
    expect(parseBrNumber("R$ 10,5")).toBeCloseTo(10.5);
    expect(parseBrNumber("1234.56")).toBeCloseTo(1234.56);
    expect(parseBrNumber("1.234")).toBe(1234);
    expect(parseBrNumber("-10,00")).toBe(-10);
    expect(parseBrNumber("(5,00)")).toBe(-5);
    expect(parseBrNumber("abc")).toBeNull();
    expect(parseBrNumber("")).toBeNull();
  });

  it("interpreta datas e competências", () => {
    expect(parseFlexibleDate("05/03/2026")).toBe("2026-03-05");
    expect(parseFlexibleDate("5/3/26")).toBe("2026-03-05");
    expect(parseFlexibleDate("2026-03-05")).toBe("2026-03-05");
    expect(parseFlexibleDate("20260305120000[-3:BRT]")).toBe("2026-03-05");
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseCompetence("09/2026")).toEqual({ year: 2026, month: 9 });
    expect(parseCompetence("2026-9")).toEqual({ year: 2026, month: 9 });
    expect(parseCompetence("13/2026")).toBeNull();
  });

  it("interpreta o tipo do evento", () => {
    expect(parseCashEventType("Aporte")).toBe("APORTE");
    expect(parseCashEventType("aplicação")).toBe("APORTE");
    expect(parseCashEventType("RESGATE")).toBe("RESGATE");
    expect(parseCashEventType("IR")).toBe("IMPOSTO");
    expect(parseCashEventType("tarifa")).toBe("TAXA");
    expect(parseCashEventType("outro")).toBeNull();
  });
});

describe("CSV de rendimentos", () => {
  it("aceita ano/mes ou competência e aponta erros por linha", () => {
    const parsed = parseReturnsCsv(
      "investimento;ano;mes;rendimento\nCDB Alfa;2026;1;100,50\nCDB Alfa;2026;13;10\nCDB Beta;2026;2;-1",
    );
    expect(parsed.error).toBeNull();
    expect(parsed.rows[0]).toMatchObject({ investment: "CDB Alfa", year: 2026, month: 1, value: 100.5, error: null });
    expect(parsed.rows[1].error).toBe("Mês inválido.");
    expect(parsed.rows[2].error).toBe("Rendimento inválido.");

    const byCompetence = parseReturnsCsv("investimento;competencia;rendimento\nCDB Alfa;03/2026;50");
    expect(byCompetence.rows[0]).toMatchObject({ year: 2026, month: 3, value: 50 });
  });

  it("recusa cabeçalho desconhecido", () => {
    expect(parseReturnsCsv("x;y\n1;2").error).toMatch(/Cabeçalho inválido/);
  });

  it("valida contra os dados existentes", () => {
    const parsed = parseReturnsCsv(
      [
        "investimento;ano;mes;rendimento",
        "CDB Alfa;2026;1;100",
        "CDB Alfa;2026;2;200",
        "cdb alfa (banco um);2026;3;300",
        "CDB Gama;2026;1;10",
        "CDB Alfa;2026;1;100",
        "CDB Beta;2026;4;40",
      ].join("\n"),
    );
    const existing = new Map([
      ["id-a|2026-2", 200],
      ["id-a|2026-3", 250],
    ]);
    const rows = validateReturnRows(parsed.rows, INVESTMENTS, existing, new Set(["2026-4"]));
    expect(rows.map((row) => row.status)).toEqual(["novo", "igual", "atualiza", "erro", "erro", "fechado"]);
    expect(rows[2].previousValue).toBe(250);
    expect(rows[3].message).toBe("Investimento não encontrado.");
    expect(rows[4].message).toBe("Linha repetida no arquivo.");
  });
});

describe("aportes e resgates", () => {
  it("lê o CSV padrão e marca duplicados", () => {
    const parsed = parseCashEventsCsv(
      "data;investimento;tipo;valor\n10/03/2026;CDB Alfa;aporte;1.000,00\n11/03/2026;CDB Beta;resgate;-500\n12/03/2026;CDB Alfa;xyz;1",
    );
    expect(parsed.rows[0]).toMatchObject({ date: "2026-03-10", type: "APORTE", amount: 1000, error: null });
    expect(parsed.rows[1]).toMatchObject({ type: "RESGATE", amount: 500 });
    expect(parsed.rows[2].error).toMatch(/Tipo inválido/);

    const rows = validateCashEventRows(
      parsed.rows,
      INVESTMENTS,
      new Set(["id-a|2026-03-10|APORTE|1000.00"]),
      new Set(),
      null,
    );
    expect(rows.map((row) => row.status)).toEqual(["duplicado", "novo", "erro"]);
  });

  it("classifica transações do OFX da conta corrente", () => {
    const ofx = [
      "OFXHEADER:100",
      "<OFX><BANKTRANLIST>",
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260310120000[-3:BRT]<TRNAMT>-1000.00<FITID>1<MEMO>APLICACAO CDB",
      "</STMTTRN>",
      "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260315<TRNAMT>500.00<FITID>2<MEMO>RESGATE CDB",
      "</STMTTRN>",
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260316<TRNAMT>-80.00<FITID>3<MEMO>MERCADO",
      "</STMTTRN>",
      "</BANKTRANLIST></OFX>",
    ].join("\n");
    const transactions = parseOfx(ofx);
    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toMatchObject({ date: "2026-03-10", amount: -1000, memo: "APLICACAO CDB" });

    const classified = classifyOfxTransactions(transactions);
    expect(classified.map((row) => row.type)).toEqual(["APORTE", "RESGATE", null]);
    expect(classified[0].amount).toBe(1000);

    const rows = validateCashEventRows(classified, INVESTMENTS, new Set(), new Set(["2026-3"]), "id-b");
    expect(rows[0]).toMatchObject({ investmentId: "id-b", status: "fechado" });
    expect(rows[2].status).toBe("ignorado");
  });

  it("encontra o investimento por nome, 'nome (instituição)' ou id", () => {
    expect(matchInvestment("cdb alfa", INVESTMENTS)?.id).toBe("id-a");
    expect(matchInvestment("CDB Beta (Banco Dois)", INVESTMENTS)?.id).toBe("id-b");
    expect(matchInvestment("id-b", INVESTMENTS)?.id).toBe("id-b");
    expect(matchInvestment("desconhecido", INVESTMENTS)).toBeNull();
  });
});
