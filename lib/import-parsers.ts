// Leitura de arquivos para importação: CSV (padrão do FinanceFlow) e OFX (extrato bancário).
// Funções puras; a validação contra o banco de dados fica na rota de importação.

export type CsvTable = { headers: string[]; rows: string[][] };

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function detectDelimiter(firstLine: string): string {
  const [best] = [";", ",", "\t"]
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count);
  return best.count > 0 ? best.delimiter : ";";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

// CSV com cabeçalho; separador ";" (Excel pt-BR), "," ou tab, detectado pela primeira linha.
export function parseCsv(text: string): CsvTable {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);
  return {
    headers: splitCsvLine(lines[0], delimiter).map(normalizeText),
    rows: lines.slice(1).map((line) => splitCsvLine(line, delimiter)),
  };
}

// "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "-10,00" → número; vazio ou inválido → null.
export function parseBrNumber(raw: string | null | undefined): number | null {
  let text = String(raw ?? "")
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/^-/, "");
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// "dd/mm/aaaa", "dd/mm/aa", "aaaa-mm-dd" ou "aaaammdd" → "aaaa-mm-dd"; inválida → null.
export function parseFlexibleDate(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text))) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else if ((match = /^(\d{4})(\d{2})(\d{2})/.exec(text))) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    return null;
  }
  if (!isValidDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "09/2026", "9/2026", "2026-09" → { year, month }.
export function parseCompetence(raw: string | null | undefined): { year: number; month: number } | null {
  const text = String(raw ?? "").trim();
  let match = /^(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) {
    const month = Number(match[1]);
    return month >= 1 && month <= 12 ? { year: Number(match[2]), month } : null;
  }
  match = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (match) {
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
  }
  return null;
}

export type ParsedReturnRow = {
  line: number;
  investment: string;
  year: number | null;
  month: number | null;
  value: number | null;
  error: string | null;
};

function column(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

// Rendimentos: colunas "investimento" + ("ano" e "mes") ou "competencia" + "rendimento".
export function parseReturnsCsv(text: string): { rows: ParsedReturnRow[]; error: string | null } {
  const table = parseCsv(text);
  const investmentCol = column(table.headers, ["investimento", "investment", "nome"]);
  const yearCol = column(table.headers, ["ano", "year"]);
  const monthCol = column(table.headers, ["mes", "month"]);
  const competenceCol = column(table.headers, ["competencia", "periodo"]);
  const valueCol = column(table.headers, ["rendimento", "renda", "valor", "income_value"]);
  if (investmentCol < 0 || valueCol < 0 || (competenceCol < 0 && (yearCol < 0 || monthCol < 0))) {
    return {
      rows: [],
      error:
        'Cabeçalho inválido. Use as colunas "investimento;ano;mes;rendimento" (ou "investimento;competencia;rendimento").',
    };
  }
  const rows = table.rows.map((cells, index): ParsedReturnRow => {
    const line = index + 2;
    const investment = (cells[investmentCol] ?? "").trim();
    let year: number | null = null;
    let month: number | null = null;
    if (competenceCol >= 0) {
      const competence = parseCompetence(cells[competenceCol]);
      year = competence?.year ?? null;
      month = competence?.month ?? null;
    } else {
      year = Number(cells[yearCol]);
      month = Number(cells[monthCol]);
      if (!Number.isInteger(year)) year = null;
      if (!Number.isInteger(month) || month < 1 || month > 12) month = null;
    }
    const value = parseBrNumber(cells[valueCol]);
    const error = !investment
      ? "Investimento vazio."
      : year === null || year < 2000 || year > 2100
        ? "Ano inválido."
        : month === null
          ? "Mês inválido."
          : value === null || value < 0
            ? "Rendimento inválido."
            : null;
    return { line, investment, year, month, value, error };
  });
  return { rows, error: null };
}

export type CashEventKind = "APORTE" | "RESGATE" | "IMPOSTO" | "TAXA";

export type ParsedCashEventRow = {
  line: number;
  investment: string | null;
  date: string | null;
  type: CashEventKind | null;
  amount: number | null;
  description: string;
  matched: boolean;
  error: string | null;
};

export function parseCashEventType(raw: string | null | undefined): CashEventKind | null {
  const text = normalizeText(String(raw ?? ""));
  if (/^(aporte|aplicacao|aplicacoes|compra)/.test(text)) return "APORTE";
  if (/^(resgate|venda|vencimento)/.test(text)) return "RESGATE";
  if (/^(imposto|ir|iof)/.test(text)) return "IMPOSTO";
  if (/^(taxa|tarifa|custodia)/.test(text)) return "TAXA";
  return null;
}

// Aportes e resgates: colunas "data;investimento;tipo;valor".
export function parseCashEventsCsv(text: string): { rows: ParsedCashEventRow[]; error: string | null } {
  const table = parseCsv(text);
  const dateCol = column(table.headers, ["data", "date", "event_date"]);
  const investmentCol = column(table.headers, ["investimento", "investment", "nome"]);
  const typeCol = column(table.headers, ["tipo", "type"]);
  const valueCol = column(table.headers, ["valor", "amount", "montante"]);
  if (dateCol < 0 || investmentCol < 0 || typeCol < 0 || valueCol < 0) {
    return { rows: [], error: 'Cabeçalho inválido. Use as colunas "data;investimento;tipo;valor".' };
  }
  const rows = table.rows.map((cells, index): ParsedCashEventRow => {
    const date = parseFlexibleDate(cells[dateCol]);
    const type = parseCashEventType(cells[typeCol]);
    const value = parseBrNumber(cells[valueCol]);
    const amount = value === null ? null : Math.abs(value);
    const investment = (cells[investmentCol] ?? "").trim() || null;
    const error = !date
      ? "Data inválida."
      : !investment
        ? "Investimento vazio."
        : !type
          ? "Tipo inválido (use aporte, resgate, imposto ou taxa)."
          : amount === null || amount === 0
            ? "Valor inválido."
            : null;
    return {
      line: index + 2,
      investment,
      date,
      type,
      amount,
      description: (cells[typeCol] ?? "").trim(),
      matched: true,
      error,
    };
  });
  return { rows, error: null };
}

export type OfxTransaction = { date: string | null; amount: number | null; memo: string; fitId: string | null };

function ofxTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return match ? match[1].trim() : null;
}

// OFX (SGML ou XML): cada <STMTTRN> vira uma transação.
export function parseOfx(text: string): OfxTransaction[] {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  return blocks.map((raw) => {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const amountText = ofxTag(block, "TRNAMT");
    const amount = amountText === null ? null : Number(amountText.replace(",", "."));
    return {
      date: parseFlexibleDate(ofxTag(block, "DTPOSTED")),
      amount: amount !== null && Number.isFinite(amount) ? amount : null,
      memo: [ofxTag(block, "NAME"), ofxTag(block, "MEMO")].filter(Boolean).join(" · "),
      fitId: ofxTag(block, "FITID"),
    };
  });
}

const APPLICATION_PATTERN = /aplic|invest|cdb|rdb|lci|lca|caixinha|tesouro|poupanca/;
const REDEMPTION_PATTERN = /resg|venc|liquidac/;

// Extrato da conta: saída de dinheiro com termo de aplicação = APORTE; entrada com termo de
// resgate/vencimento = RESGATE. As demais transações ficam desmarcadas.
export function classifyOfxTransactions(transactions: OfxTransaction[]): ParsedCashEventRow[] {
  return transactions.map((transaction, index): ParsedCashEventRow => {
    const memo = normalizeText(transaction.memo);
    const amount = transaction.amount === null ? null : Math.abs(transaction.amount);
    let type: CashEventKind | null = null;
    if (transaction.amount !== null && transaction.amount < 0 && APPLICATION_PATTERN.test(memo)) type = "APORTE";
    if (transaction.amount !== null && transaction.amount > 0 && (REDEMPTION_PATTERN.test(memo) || APPLICATION_PATTERN.test(memo))) {
      type = "RESGATE";
    }
    const error = !transaction.date ? "Data inválida." : amount === null || amount === 0 ? "Valor inválido." : null;
    return {
      line: index + 1,
      investment: null,
      date: transaction.date,
      type,
      amount,
      description: transaction.memo,
      matched: type !== null,
      error,
    };
  });
}
