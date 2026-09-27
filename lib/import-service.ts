import "server-only";
import { supabase } from "./supabase";
import { classifyOfxTransactions, parseCashEventsCsv, parseOfx, parseReturnsCsv } from "./import-parsers";
import {
  ImportInvestment,
  cashEventKey,
  periodKey,
  validateCashEventRows,
  validateReturnRows,
} from "./import-validation";
import { ImportFormat, ImportKind, ImportPreviewPayload, ImportPreviewRow } from "../types";

export const IMPORT_MAX_CHARS = 2_000_000;
export const IMPORT_MAX_ROWS = 3000;

const EMPTY_COUNTS: ImportPreviewPayload["counts"] = {
  novo: 0,
  atualiza: 0,
  igual: 0,
  duplicado: 0,
  fechado: 0,
  erro: 0,
  ignorado: 0,
};

export function isImportKind(value: unknown): value is ImportKind {
  return value === "returns" || value === "cash_events";
}

export function isImportFormat(value: unknown): value is ImportFormat {
  return value === "csv" || value === "ofx";
}

async function loadClosedPeriods(): Promise<Set<string>> {
  const { data, error } = await supabase.from("monthly_closures").select("year,month,is_closed");
  if (error) {
    if (error.message?.includes("monthly_closures")) return new Set();
    throw new Error(error.message);
  }
  return new Set(
    (data ?? [])
      .filter((row) => row.is_closed)
      .map((row) => periodKey(Number(row.year), Number(row.month))),
  );
}

async function loadInvestments(): Promise<ImportInvestment[]> {
  const { data, error } = await supabase.from("investments").select("id,name,institution");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, institution: row.institution }));
}

// Lê o arquivo e valida cada linha contra o banco. Usado pela prévia e, de novo, na gravação.
export async function buildImportPreview(input: {
  kind: ImportKind;
  format: ImportFormat;
  content: string;
  investmentId: string | null;
}): Promise<ImportPreviewPayload> {
  const { kind, format, content, investmentId } = input;
  const empty = (error: string): ImportPreviewPayload => ({ kind, format, rows: [], counts: { ...EMPTY_COUNTS }, error });

  if (content.length > IMPORT_MAX_CHARS) return empty("Arquivo muito grande (limite de 2 MB).");
  const [investments, closedPeriods] = await Promise.all([loadInvestments(), loadClosedPeriods()]);
  let rows: ImportPreviewRow[];

  if (kind === "returns") {
    if (format !== "csv") return empty("Rendimentos só podem ser importados em CSV.");
    const parsed = parseReturnsCsv(content);
    if (parsed.error) return empty(parsed.error);
    if (parsed.rows.length > IMPORT_MAX_ROWS) return empty(`Arquivo com mais de ${IMPORT_MAX_ROWS} linhas.`);
    const { data, error } = await supabase.from("monthly_returns").select("investment_id,year,month,income_value");
    if (error) throw new Error(error.message);
    const existing = new Map(
      (data ?? []).map((row) => [
        `${row.investment_id}|${periodKey(Number(row.year), Number(row.month))}`,
        Number(row.income_value ?? 0),
      ]),
    );
    rows = validateReturnRows(parsed.rows, investments, existing, closedPeriods).map((row) => ({
      line: row.line,
      investmentId: row.investmentId,
      investmentLabel: row.investmentLabel,
      year: row.year,
      month: row.month,
      date: null,
      type: null,
      value: row.value,
      previousValue: row.previousValue,
      description: null,
      status: row.status,
      importable: row.status === "novo" || row.status === "atualiza",
      message: row.message,
    }));
  } else {
    const parsed =
      format === "ofx"
        ? { rows: classifyOfxTransactions(parseOfx(content)), error: null }
        : parseCashEventsCsv(content);
    if (parsed.error) return empty(parsed.error);
    if (format === "ofx" && !investmentId) return empty("Escolha o investimento que recebe os aportes do extrato.");
    if (parsed.rows.length > IMPORT_MAX_ROWS) return empty(`Arquivo com mais de ${IMPORT_MAX_ROWS} linhas.`);
    const { data, error } = await supabase.from("investment_cash_events").select("investment_id,event_date,type,amount");
    if (error) throw new Error(error.message);
    const existing = new Set(
      (data ?? []).map((row) =>
        cashEventKey(row.investment_id, String(row.event_date), String(row.type), Number(row.amount ?? 0)),
      ),
    );
    rows = validateCashEventRows(parsed.rows, investments, existing, closedPeriods, investmentId).map((row) => {
      const [year, month] = row.date ? row.date.split("-").map(Number) : [null, null];
      return {
        line: row.line,
        investmentId: row.investmentId,
        investmentLabel: row.investmentLabel,
        year,
        month,
        date: row.date,
        type: row.type,
        value: row.amount,
        previousValue: null,
        description: row.description,
        status: row.status,
        importable: row.status === "novo",
        message: row.message,
      };
    });
  }

  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) counts[row.status] += 1;
  return { kind, format, rows, counts, error: rows.length === 0 ? "Nenhuma linha encontrada no arquivo." : null };
}
