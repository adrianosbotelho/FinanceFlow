import { NextResponse } from "next/server";
import pkg from "../../../package.json";
import { supabase } from "../../../lib/supabase";
import { HealthCheckPayload, HealthTableCheck } from "../../../types";

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

export async function GET() {
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
    runTableCheck("monthly_positions"),
    runTableCheck("monthly_macro"),
  ]);

  const dbStatus =
    !dbError && tableChecks.every((check) => check.status === "ok")
      ? "ok"
      : "error";

  const status: HealthCheckPayload["status"] =
    missing.length === 0 && dbStatus === "ok" ? "ok" : "degraded";

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
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
