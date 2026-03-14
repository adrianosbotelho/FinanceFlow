import { NextResponse } from "next/server";
import pkg from "../../../package.json";
import { supabase } from "../../../lib/supabase";
import { HealthApiCheck, HealthCheckPayload, HealthTableCheck } from "../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
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
  endpoint: string;
  validate?: (payload: unknown) => boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
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

const API_CHECKS: ApiCheckConfig[] = [
  {
    name: "Dashboard",
    panel: "Dashboard",
    endpoint: "/api/dashboard",
    validate: (payload) => isRecord(payload) && isRecord(payload.kpis),
  },
  {
    name: "Investimentos",
    panel: "Investimentos",
    endpoint: "/api/investments",
    validate: isArray,
  },
  {
    name: "Forecast CDB",
    panel: "Investimentos",
    endpoint: "/api/investments/forecast",
    validate: (payload) => isRecord(payload) && isArray(payload.series),
  },
  {
    name: "Retornos",
    panel: "Retornos Mensais",
    endpoint: "/api/returns",
    validate: isArray,
  },
  {
    name: "Fechamentos Mensais",
    panel: "Retornos Mensais",
    endpoint: "/api/monthly-closures",
    validate: isArray,
  },
  {
    name: "Performance",
    panel: "Performance",
    endpoint: "/api/performance",
    validate: (payload) => isRecord(payload) && isRecord(payload.kpis),
  },
  {
    name: "Metas Mensais",
    panel: "Metas",
    endpoint: "/api/investment-goals-monthly",
    validate: isArray,
  },
  {
    name: "Metas Anuais",
    panel: "Metas",
    endpoint: "/api/investment-goals-annual",
    validate: isArray,
  },
  {
    name: "Posições Mensais",
    panel: "Performance/Metas",
    endpoint: "/api/monthly-positions",
    validate: isArray,
  },
  {
    name: "Macro Mensal",
    panel: "Performance",
    endpoint: "/api/monthly-macro",
    validate: isArray,
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
    endpoint === "/api/returns" ||
    endpoint === "/api/investments/forecast" ||
    endpoint === "/api/investment-goals-annual"
  ) {
    return `${endpoint}${joiner}year=${year}`;
  }
  return endpoint;
}

async function runApiCheck(origin: string, config: ApiCheckConfig): Promise<HealthApiCheck> {
  const url = `${origin}${endpointWithDefaultParams(config.endpoint)}`;
  const start = Date.now();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      return {
        name: config.name,
        panel: config.panel,
        endpoint: config.endpoint,
        method: "GET",
        status: "error",
        httpStatus: response.status,
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (config.validate && !config.validate(payload)) {
      return {
        name: config.name,
        panel: config.panel,
        endpoint: config.endpoint,
        method: "GET",
        status: "error",
        httpStatus: response.status,
        latencyMs,
        error: "Payload fora do formato esperado",
      };
    }

    return {
      name: config.name,
      panel: config.panel,
      endpoint: config.endpoint,
      method: "GET",
      status: "ok",
      httpStatus: response.status,
      latencyMs,
      error: null,
    };
  } catch (error) {
    return {
      name: config.name,
      panel: config.panel,
      endpoint: config.endpoint,
      method: "GET",
      status: "error",
      httpStatus: null,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Erro ao chamar endpoint",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
    runTableCheck("investment_goals_monthly"),
    runTableCheck("investment_goals_annual"),
    runTableCheck("monthly_positions"),
    runTableCheck("monthly_macro"),
  ]);
  const apiChecks = await Promise.all(API_CHECKS.map((check) => runApiCheck(origin, check)));

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
