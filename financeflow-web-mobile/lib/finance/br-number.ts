// Cópia fiel de parseBrNumber() de lib/import-parsers.ts do app desktop (os projetos são isolados).
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
