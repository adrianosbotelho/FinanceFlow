import { NextResponse } from "next/server";
import { MarketSnapshotPayload } from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELIC_META_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/5?formato=json";
const CDI_DAILY_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json";
const YAHOO_IBOV_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=10d&interval=1d";
const YAHOO_IFIX_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/IFIX.SA?range=10d&interval=1d";

const CACHE_SUCCESS_TTL_MS = 5 * 60 * 1000;
const CACHE_FALLBACK_TTL_MS = 60 * 1000;
const MARKET_FETCH_TIMEOUT_MS = 5000;

type BcbPoint = { valor?: string };
type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
        regularMarketChangePercent?: number;
        regularMarketPreviousClose?: number;
        regularMarketChange?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

let marketSnapshotCache: { value: MarketSnapshotPayload; expiresAt: number } | null = null;

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === "string" ? value.replace(",", ".") : String(value);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function annualizeDailyRate(dailyRatePercent: number): number {
  return (Math.pow(1 + dailyRatePercent / 100, 252) - 1) * 100;
}

function extractLatestBcbValue(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const row = payload[i] as BcbPoint;
    const value = toNumber(row?.valor);
    if (value !== null) return value;
  }
  return null;
}

function extractLatestYahooClose(payload: unknown): {
  close: number | null;
  date: string | null;
  dayChangePercent: number | null;
} {
  const data = payload as YahooChartPayload;
  const point = data?.chart?.result?.[0];
  const meta = point?.meta;
  const timestamps = Array.isArray(point?.timestamp) ? point.timestamp : [];
  const closes = point?.indicators?.quote?.[0]?.close ?? [];

  const maxLength = Math.min(timestamps.length, closes.length);
  const metaPrice = toNumber(meta?.regularMarketPrice);
  const metaTime = toNumber(meta?.regularMarketTime);
  let latestClose: number | null = null;
  let latestDate: string | null = null;

  for (let i = maxLength - 1; i >= 0; i -= 1) {
    const close = toNumber(closes[i]);
    const ts = Number(timestamps[i]);
    if (close === null || !Number.isFinite(ts)) continue;
    if (latestClose === null) {
      latestClose = close;
      latestDate = new Date(ts * 1000).toISOString();
      continue;
    }
    break;
  }

  // Use the quote-level market fields first; Yahoo may duplicate the last candle in the series.
  if (metaPrice !== null) latestClose = metaPrice;
  if (metaTime !== null && Number.isFinite(metaTime)) {
    latestDate = new Date(metaTime * 1000).toISOString();
  }

  const previousClose = toNumber(
    meta?.regularMarketPreviousClose ?? meta?.previousClose ?? meta?.chartPreviousClose,
  );

  const metaChangePercent = toNumber(meta?.regularMarketChangePercent);
  const metaChange = toNumber(meta?.regularMarketChange);
  let dayChangePercent: number | null = null;

  if (metaChangePercent !== null) {
    dayChangePercent = metaChangePercent;
  } else if (latestClose !== null && previousClose !== null && previousClose !== 0) {
    dayChangePercent = ((latestClose - previousClose) / previousClose) * 100;
  } else if (metaChange !== null && previousClose !== null && previousClose !== 0) {
    dayChangePercent = (metaChange / previousClose) * 100;
  }

  if (dayChangePercent !== null && !Number.isFinite(dayChangePercent)) {
    dayChangePercent = null;
  }

  return { close: latestClose, date: latestDate, dayChangePercent };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (FinanceFlow Market Snapshot)",
      },
      signal: AbortSignal.timeout(MARKET_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  if (marketSnapshotCache && marketSnapshotCache.expiresAt > now) {
    return NextResponse.json(marketSnapshotCache.value, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }

  const [selicPayload, cdiPayload, ibovPayload, ifixPayload] = await Promise.all([
    fetchJson(SELIC_META_URL),
    fetchJson(CDI_DAILY_URL),
    fetchJson(YAHOO_IBOV_URL),
    fetchJson(YAHOO_IFIX_URL),
  ]);

  const warnings: string[] = [];
  const selicPercent = extractLatestBcbValue(selicPayload);
  const cdiDailyPercent = extractLatestBcbValue(cdiPayload);
  const cdiAnnualizedPercent =
    cdiDailyPercent !== null ? annualizeDailyRate(cdiDailyPercent) : null;
  const ibov = extractLatestYahooClose(ibovPayload);
  const ifix = extractLatestYahooClose(ifixPayload);

  if (selicPercent === null) warnings.push("Falha ao ler Selic atual (BCB SGS 432).");
  if (cdiDailyPercent === null) warnings.push("Falha ao ler CDI diário atual (BCB SGS 12).");
  if (ibov.close === null) warnings.push("Falha ao ler fechamento do Ibovespa (Yahoo Finance).");
  if (ifix.close === null) warnings.push("Falha ao ler fechamento do IFIX (Yahoo Finance).");

  const payload: MarketSnapshotPayload = {
    generatedAt: new Date().toISOString(),
    selicPercent,
    cdiDailyPercent,
    cdiAnnualizedPercent,
    ibovespaPreviousClose: ibov.close,
    ibovespaDate: ibov.date,
    ibovespaDayChangePercent: ibov.dayChangePercent,
    ifixPreviousClose: ifix.close,
    ifixDate: ifix.date,
    ifixDayChangePercent: ifix.dayChangePercent,
    warnings,
  };

  marketSnapshotCache = {
    value: payload,
    expiresAt: now + (warnings.length > 0 ? CACHE_FALLBACK_TTL_MS : CACHE_SUCCESS_TTL_MS),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
