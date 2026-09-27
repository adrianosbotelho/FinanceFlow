const FALLBACK_CDI_ANNUAL_RATE = 10.65;
const CDI_SERIES_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json";
const CDI_CACHE_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const CDI_CACHE_FALLBACK_TTL_MS = 30 * 60 * 1000;
const CDI_FETCH_TIMEOUT_MS = 1800;

export type CdiReferenceSource = "bcb" | "env" | "fallback";

type BcbSeriesPoint = {
  data?: string;
  valor?: string;
};

let cdiAnnualCache: { value: number; source: CdiReferenceSource; expiresAt: number } | null = null;

function resolveEnvCdiAnnualFallback(): { value: number; source: CdiReferenceSource } {
  const cdiEnv = Number(process.env.FINANCEFLOW_CDI_ANNUAL_RATE);
  if (Number.isFinite(cdiEnv) && cdiEnv > 0) return { value: cdiEnv, source: "env" };
  return { value: FALLBACK_CDI_ANNUAL_RATE, source: "fallback" };
}

export function annualizeDailyRate(dailyRatePercent: number): number {
  return (Math.pow(1 + dailyRatePercent / 100, 252) - 1) * 100;
}

// CDI anual (% a.a.) a partir da série 12 do BCB; FINANCEFLOW_CDI_ANNUAL_RATE (ou 10,65) como fallback.
export async function resolveCdiAnnualReferenceWithSource(): Promise<{
  value: number;
  source: CdiReferenceSource;
}> {
  const now = Date.now();
  if (cdiAnnualCache && cdiAnnualCache.expiresAt > now) {
    return { value: cdiAnnualCache.value, source: cdiAnnualCache.source };
  }

  const fallback = resolveEnvCdiAnnualFallback();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), CDI_FETCH_TIMEOUT_MS);
    const response = await fetch(CDI_SERIES_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (timeout) clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`BCB status ${response.status}`);
    }

    const payload = (await response.json()) as BcbSeriesPoint[];
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error("BCB payload vazio");
    }

    const latestPoint = [...payload]
      .reverse()
      .find((point) => Number.isFinite(Number((point.valor ?? "").replace(",", "."))));
    if (!latestPoint?.valor) {
      throw new Error("BCB sem valor válido");
    }

    const dailyRate = Number(latestPoint.valor.replace(",", "."));
    if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
      throw new Error("Taxa CDI diária inválida");
    }

    const annualized = annualizeDailyRate(dailyRate);
    if (!Number.isFinite(annualized) || annualized <= 0) {
      throw new Error("Taxa CDI anualizada inválida");
    }

    cdiAnnualCache = { value: annualized, source: "bcb", expiresAt: now + CDI_CACHE_SUCCESS_TTL_MS };
    return { value: annualized, source: "bcb" };
  } catch (error) {
    console.warn("Falha ao obter CDI no BCB, usando fallback local.", error);
    cdiAnnualCache = { ...fallback, expiresAt: now + CDI_CACHE_FALLBACK_TTL_MS };
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function resolveCdiAnnualReference(): Promise<number> {
  return (await resolveCdiAnnualReferenceWithSource()).value;
}

const CDI_MONTHLY_SERIES_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados";
const CDI_MONTHLY_FETCH_TIMEOUT_MS = 5000;
const CDI_MONTHLY_FALLBACK_TTL_MS = 2 * 60 * 1000;
const cdiMonthlyCache = new Map<number, { value: Map<number, number>; expiresAt: number }>();

// CDI acumulado de cada mês do ano (% no mês), série 4391 do BCB. Mapa vazio se o BCB falhar.
export async function resolveMonthlyCdiHistory(year: number): Promise<Map<number, number>> {
  const now = Date.now();
  const cached = cdiMonthlyCache.get(year);
  if (cached && cached.expiresAt > now) return cached.value;

  const result = new Map<number, number>();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), CDI_MONTHLY_FETCH_TIMEOUT_MS);
    const url = `${CDI_MONTHLY_SERIES_URL}?formato=json&dataInicial=01/01/${year}&dataFinal=31/12/${year}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`BCB status ${response.status}`);
    const payload = (await response.json()) as BcbSeriesPoint[];
    for (const point of Array.isArray(payload) ? payload : []) {
      const [, month, pointYear] = String(point.data ?? "").split("/").map(Number);
      const value = Number(String(point.valor ?? "").replace(",", "."));
      if (pointYear === year && month >= 1 && month <= 12 && Number.isFinite(value)) {
        result.set(month, value);
      }
    }
    cdiMonthlyCache.set(year, { value: result, expiresAt: now + CDI_CACHE_SUCCESS_TTL_MS });
  } catch (error) {
    console.warn("Falha ao obter CDI mensal no BCB; meses passados usam o CDI atual.", error);
    cdiMonthlyCache.set(year, { value: result, expiresAt: now + CDI_MONTHLY_FALLBACK_TTL_MS });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return result;
}

// Último valor de uma série do BCB (% a.a.), com cache e fallback. Séries: 432 = meta Selic,
// 13522 = IPCA acumulado em 12 meses.
const latestSeriesCache = new Map<number, { value: number; source: CdiReferenceSource; expiresAt: number }>();

export async function resolveLatestBcbSeriesValue(
  seriesCode: number,
  fallback: number,
): Promise<{ value: number; source: CdiReferenceSource }> {
  const now = Date.now();
  const cached = latestSeriesCache.get(seriesCode);
  if (cached && cached.expiresAt > now) return { value: cached.value, source: cached.source };

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), CDI_MONTHLY_FETCH_TIMEOUT_MS);
    const response = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados/ultimos/3?formato=json`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) throw new Error(`BCB status ${response.status}`);
    const payload = (await response.json()) as BcbSeriesPoint[];
    const values = (Array.isArray(payload) ? payload : [])
      .map((point) => Number(String(point.valor ?? "").replace(",", ".")))
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) throw new Error("BCB sem valor válido");
    const value = values[values.length - 1];
    latestSeriesCache.set(seriesCode, { value, source: "bcb", expiresAt: now + CDI_CACHE_SUCCESS_TTL_MS });
    return { value, source: "bcb" };
  } catch (error) {
    console.warn(`Falha ao obter a série ${seriesCode} no BCB; usando fallback.`, error);
    latestSeriesCache.set(seriesCode, { value: fallback, source: "fallback", expiresAt: now + CDI_MONTHLY_FALLBACK_TTL_MS });
    return { value: fallback, source: "fallback" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
