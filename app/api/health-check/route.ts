import { NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import pkg from "../../../package.json";
import { supabase } from "../../../lib/supabase";
import { HealthApiCheck, HealthCheckPayload, HealthTableCheck } from "../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const OPTIONAL_ENV_KEYS = [
  "NEXT_PUBLIC_BASE_URL",
  "FINANCEFLOW_ANNUAL_INCOME_TARGET",
  "FINANCEFLOW_CDI_ANNUAL_RATE",
  "FINANCEFLOW_PORT",
] as const;

type ApiCheckConfig = {
  name: string;
  panel: string;
  source: "internal" | "external";
  endpoint: string | (() => string);
  validate?: (payload: unknown) => boolean;
};

const INTERNAL_API_TIMEOUT_MS = 5000;
const EXTERNAL_API_TIMEOUT_MS = 4000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isYahooChartPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const chart = value.chart;
  if (!isRecord(chart)) return false;
  const result = chart.result;
  if (!Array.isArray(result) || result.length === 0) return false;
  const first = result[0];
  if (!isRecord(first)) return false;
  const indicators = first.indicators;
  if (!isRecord(indicators)) return false;
  const quote = indicators.quote;
  if (!Array.isArray(quote) || quote.length === 0) return false;
  const firstQuote = quote[0];
  if (!isRecord(firstQuote)) return false;
  return Array.isArray(firstQuote.close);
}

function isCoinGeckoSimplePricePayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.bitcoin) &&
    isRecord(value.ethereum) &&
    isRecord(value.solana) &&
    isRecord(value.stellar)
  );
}

function safeHostFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.host;
  } catch {
    return null;
  }
}

function formatBcbDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function buildBcbSeriesDateRangeUrl(seriesCode: number, lookbackDays: number): string {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - lookbackDays);
  const params = new URLSearchParams({
    formato: "json",
    dataInicial: formatBcbDate(startDate),
    dataFinal: formatBcbDate(endDate),
  });
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados?${params.toString()}`;
}

async function runTableCheck(table: string): Promise<HealthTableCheck> {
  const start = Date.now();
  const { count, error } = await supabase
    .from(table)
    .select("*", { head: true, count: "exact" });
  const latencyMs = Date.now() - start;

  return {
    table,
    status: error ? "error" : "ok",
    count: error ? null : count ?? 0,
    latencyMs,
    error: error?.message ?? null,
  };
}

const INTERNAL_API_CHECKS: ApiCheckConfig[] = [
  {
    name: "Dashboard",
    panel: "Dashboard",
    source: "internal",
    endpoint: "/api/dashboard",
    validate: (payload) => isRecord(payload) && isRecord(payload.kpis),
  },
  {
    name: "Investimentos",
    panel: "Investimentos",
    source: "internal",
    endpoint: "/api/investments",
    validate: isArray,
  },
  {
    name: "Forecast CDB",
    panel: "Investimentos",
    source: "internal",
    endpoint: "/api/investments/forecast",
    validate: (payload) => isRecord(payload) && isArray(payload.series),
  },
  {
    name: "Insights Diário",
    panel: "Insights",
    source: "internal",
    endpoint: "/api/insights/daily",
    validate: (payload) => isRecord(payload) && isRecord(payload.report),
  },
  {
    name: "Insights Mercado (Snapshot)",
    panel: "Insights",
    source: "internal",
    endpoint: "/api/insights/market-snapshot",
    validate: (payload) =>
      isRecord(payload) &&
      ("selicPercent" in payload || "ibovespaPreviousClose" in payload),
  },
  {
    name: "Retornos",
    panel: "Retornos Mensais",
    source: "internal",
    endpoint: "/api/returns",
    validate: isArray,
  },
  {
    name: "Revisões de Retorno",
    panel: "Retornos Mensais",
    source: "internal",
    endpoint: "/api/return-revisions",
    validate: isArray,
  },
  {
    name: "Fechamentos Mensais",
    panel: "Retornos Mensais",
    source: "internal",
    endpoint: "/api/monthly-closures",
    validate: isArray,
  },
  {
    name: "Performance",
    panel: "Performance",
    source: "internal",
    endpoint: "/api/performance",
    validate: (payload) => isRecord(payload) && isRecord(payload.kpis),
  },
  {
    name: "Metas Mensais",
    panel: "Metas",
    source: "internal",
    endpoint: "/api/investment-goals-monthly",
    validate: isArray,
  },
  {
    name: "Metas Anuais",
    panel: "Metas",
    source: "internal",
    endpoint: "/api/investment-goals-annual",
    validate: isArray,
  },
  {
    name: "Posições Mensais",
    panel: "Performance/Metas",
    source: "internal",
    endpoint: "/api/monthly-positions",
    validate: isArray,
  },
  {
    name: "Eventos de Caixa",
    panel: "Performance",
    source: "internal",
    endpoint: "/api/investment-cash-events",
    validate: isArray,
  },
  {
    name: "Macro Mensal",
    panel: "Performance",
    source: "internal",
    endpoint: "/api/monthly-macro",
    validate: isArray,
  },
];

const EXTERNAL_API_CHECKS: ApiCheckConfig[] = [
  {
    name: "BCB CDI diário (SGS 12)",
    panel: "Dashboard/Insights",
    source: "external",
    endpoint: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json",
    validate: isArray,
  },
  {
    name: "BCB Selic meta (SGS 432)",
    panel: "Dashboard/Insights",
    source: "external",
    endpoint: () => buildBcbSeriesDateRangeUrl(432, 120),
    validate: isArray,
  },
  {
    name: "BCB IPCA 12m (SGS 13522)",
    panel: "Dashboard/Insights",
    source: "external",
    endpoint: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/12?formato=json",
    validate: isArray,
  },
  {
    name: "Yahoo Ibovespa D-1 (^BVSP)",
    panel: "Insights",
    source: "external",
    endpoint: "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=10d&interval=1d",
    validate: isYahooChartPayload,
  },
  {
    name: "Yahoo IFIX D-1 (IFIX.SA)",
    panel: "Insights",
    source: "external",
    endpoint: "https://query1.finance.yahoo.com/v8/finance/chart/IFIX.SA?range=10d&interval=1d",
    validate: isYahooChartPayload,
  },
  {
    name: "CoinGecko Crypto Quotes (BTC/ETH/SOL/XLM)",
    panel: "Insights",
    source: "external",
    endpoint:
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,stellar&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true",
    validate: isCoinGeckoSimplePricePayload,
  },
];

function endpointWithDefaultParams(endpoint: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const joiner = endpoint.includes("?") ? "&" : "?";
  if (endpoint === "/api/investment-goals-monthly") {
    return `${endpoint}${joiner}year=${year}&month=${month}`;
  }
  if (
    endpoint === "/api/dashboard" ||
    endpoint === "/api/performance" ||
    endpoint === "/api/monthly-positions" ||
    endpoint === "/api/monthly-macro" ||
    endpoint === "/api/investment-cash-events" ||
    endpoint === "/api/returns" ||
    endpoint === "/api/return-revisions" ||
    endpoint === "/api/investments/forecast" ||
    endpoint === "/api/insights/daily" ||
    endpoint === "/api/investment-goals-annual"
  ) {
    return `${endpoint}${joiner}year=${year}`;
  }
  return endpoint;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractApiError(statusCode: number, raw: string): string {
  if (!raw) {
    return `HTTP ${statusCode}`;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const detail =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.message === "string"
          ? parsed.message
          : null;
    if (detail) {
      return `HTTP ${statusCode} - ${detail}`;
    }
  } catch {
    // body não era JSON, segue com texto bruto.
  }

  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) {
    return `HTTP ${statusCode}`;
  }
  return `HTTP ${statusCode} - ${compact.slice(0, 200)}`;
}

type HttpProbeResponse = {
  statusCode: number | null;
  latencyMs: number;
  body: string;
};

async function httpProbeGet(url: string, timeoutMs: number): Promise<HttpProbeResponse> {
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (FinanceFlow Health Check)",
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? null,
            latencyMs: Date.now() - startedAt,
            body,
          });
        });
      },
    );

    req.on("error", (error) => {
      reject(error);
    });

    req.on("timeout", () => {
      req.destroy(new Error("Timeout ao chamar endpoint"));
    });

    req.end();
  });
}

async function runApiCheck(origin: string, config: ApiCheckConfig): Promise<HealthApiCheck> {
  const endpointValue =
    typeof config.endpoint === "function" ? config.endpoint() : config.endpoint;
  const resolvedEndpoint =
    config.source === "internal"
      ? endpointWithDefaultParams(endpointValue)
      : endpointValue;
  const url =
    config.source === "internal" ? `${origin}${resolvedEndpoint}` : resolvedEndpoint;
  const maxAttempts = config.source === "internal" ? 2 : 1;
  const timeoutMs =
    config.source === "internal" ? INTERNAL_API_TIMEOUT_MS : EXTERNAL_API_TIMEOUT_MS;

  let lastFailure: HealthApiCheck | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await httpProbeGet(url, timeoutMs);
      const latencyMs = response.latencyMs;
      const statusCode = response.statusCode;

      if (!statusCode || statusCode >= 400) {
        const error = extractApiError(statusCode ?? 0, response.body);
        lastFailure = {
          name: config.name,
          panel: config.panel,
          source: config.source,
          endpoint: resolvedEndpoint,
          method: "GET",
          status: "error",
          httpStatus: statusCode,
          latencyMs,
          error,
        };
        const retryable = config.source === "internal" && (statusCode ?? 0) >= 500;
        if (attempt < maxAttempts && retryable) {
          await sleep(150);
          continue;
        }
        return lastFailure;
      }

      let payload: unknown = null;
      try {
        payload = response.body ? JSON.parse(response.body) : null;
      } catch {
        payload = null;
      }

      if (config.validate && !config.validate(payload)) {
        return {
          name: config.name,
          panel: config.panel,
          source: config.source,
          endpoint: resolvedEndpoint,
          method: "GET",
          status: "error",
          httpStatus: statusCode,
          latencyMs,
          error: "Payload fora do formato esperado",
        };
      }

      return {
        name: config.name,
        panel: config.panel,
        source: config.source,
        endpoint: resolvedEndpoint,
        method: "GET",
        status: "ok",
        httpStatus: statusCode,
        latencyMs,
        error: null,
      };
    } catch (error) {
      lastFailure = {
        name: config.name,
        panel: config.panel,
        source: config.source,
        endpoint: resolvedEndpoint,
        method: "GET",
        status: "error",
        httpStatus: null,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Erro ao chamar endpoint",
      };
      if (attempt < maxAttempts && config.source === "internal") {
        await sleep(150);
        continue;
      }
      return lastFailure;
    }
  }

  return (
    lastFailure ?? {
      name: config.name,
      panel: config.panel,
      source: config.source,
      endpoint: resolvedEndpoint,
      method: "GET",
      status: "error",
      httpStatus: null,
      latencyMs: 0,
      error: "Falha desconhecida",
    }
  );
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const required = Object.fromEntries(
    REQUIRED_ENV_KEYS.map((key) => [key, Boolean(process.env[key])]),
  ) as Record<string, boolean>;

  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);

  const optional = Object.fromEntries(
    OPTIONAL_ENV_KEYS.map((key) => [key, process.env[key] ?? null]),
  ) as Record<string, string | null>;

  const dbStart = Date.now();
  const { error: dbError } = await supabase
    .from("investments")
    .select("id")
    .limit(1);
  const dbLatency = Date.now() - dbStart;

  const tableChecks = await Promise.all([
    runTableCheck("investments"),
    runTableCheck("monthly_returns"),
    runTableCheck("monthly_return_revisions"),
    runTableCheck("investment_goals_monthly"),
    runTableCheck("investment_goals_annual"),
    runTableCheck("monthly_positions"),
    runTableCheck("monthly_macro"),
    runTableCheck("investment_cash_events"),
    runTableCheck("insight_daily_runs"),
  ]);
  const internalApiChecks: HealthApiCheck[] = [];
  for (const check of INTERNAL_API_CHECKS) {
    internalApiChecks.push(await runApiCheck(origin, check));
  }
  const externalApiChecks = await Promise.all(
    EXTERNAL_API_CHECKS.map((check) => runApiCheck(origin, check)),
  );
  const apiChecks = [...internalApiChecks, ...externalApiChecks];

  const dbStatus =
    !dbError && tableChecks.every((check) => check.status === "ok")
      ? "ok"
      : "error";
  const apiStatus = apiChecks.every((check) => check.status === "ok") ? "ok" : "error";

  const status: HealthCheckPayload["status"] =
    missing.length === 0 && dbStatus === "ok" && apiStatus === "ok"
      ? "ok"
      : "degraded";

  const payload: HealthCheckPayload = {
    status,
    generatedAt: new Date().toISOString(),
    app: {
      name: pkg.name ?? "financeflow",
      version: pkg.version ?? "0.0.0",
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      uptimeSec: Math.floor(process.uptime()),
      nextPublicBaseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? null,
      financeflowPort: process.env.FINANCEFLOW_PORT ?? null,
    },
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    environment: {
      required,
      missing,
      optional,
      supabaseHost: safeHostFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    },
    database: {
      status: dbStatus,
      latencyMs: dbError ? null : dbLatency,
      error: dbError?.message ?? null,
      tables: tableChecks,
    },
    api: {
      status: apiStatus,
      checks: apiChecks,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
