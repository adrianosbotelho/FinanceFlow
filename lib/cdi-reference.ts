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
