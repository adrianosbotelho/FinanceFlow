import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import {
  buildDailyInsightReport,
  buildFallbackDailyInsightPayload,
  getSaoPauloDateISO,
  maybeEnhanceDailyInsightWithLlm,
  summarizeHistoryFromRows,
} from "../../../../lib/daily-insights-agent";
import { DailyInsightApiPayload, DailyInsightReport, DashboardPayload } from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingTableError(message: string | undefined, table: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find the table") ||
      lower.includes("relation"))
  );
}

function parseReport(value: unknown): DailyInsightReport | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as DailyInsightReport;
  if (!maybe.runDate || !maybe.radarStatus || !Array.isArray(maybe.actions)) {
    return null;
  }
  return maybe;
}

async function fetchDashboard(baseUrl: string, year: number): Promise<DashboardPayload | null> {
  try {
    const res = await fetch(`${baseUrl}/api/dashboard?year=${year}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardPayload;
  } catch {
    return null;
  }
}

async function fetchHistory(year: number): Promise<DailyInsightApiPayload["history"]> {
  const { data, error } = await supabase
    .from("insight_daily_runs")
    .select("run_date,radar_status,confidence_percent,headline,generated_by")
    .eq("year", year)
    .order("run_date", { ascending: false })
    .limit(14);

  if (error || !data) return [];
  return summarizeHistoryFromRows(data as Array<Record<string, unknown>>);
}

function resolveBaseUrl(req: NextRequest): string {
  const host = req.headers.get("host");
  const protocol = req.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${protocol}://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const force = searchParams.get("force") === "1";
  const runDate = getSaoPauloDateISO();
  const warnings: string[] = [];

  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "year inválido." }, { status: 400 });
  }

  if (!force) {
    const { data: cachedRow, error: cachedError } = await supabase
      .from("insight_daily_runs")
      .select("report,run_date,radar_status,confidence_percent,headline,generated_by")
      .eq("run_date", runDate)
      .eq("year", year)
      .maybeSingle();

    if (cachedError) {
      if (!isMissingTableError(cachedError.message, "insight_daily_runs")) {
        return NextResponse.json({ error: cachedError.message }, { status: 500 });
      }
      warnings.push("Tabela insight_daily_runs não existe. Operando sem persistência diária.");
    } else if (cachedRow) {
      const cachedReport = parseReport((cachedRow as { report?: unknown }).report);
      if (cachedReport) {
        const history = await fetchHistory(year);
        const payload: DailyInsightApiPayload = {
          source: "cache",
          warnings,
          report: cachedReport,
          history:
            history.length > 0
              ? history
              : [
                  {
                    runDate: cachedReport.runDate,
                    radarStatus: cachedReport.radarStatus,
                    confidencePercent: cachedReport.confidencePercent,
                    headline: cachedReport.headline,
                    generatedBy: cachedReport.generatedBy,
                  },
                ],
        };
        return NextResponse.json(payload, {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        });
      }
    }
  }

  const baseUrl = resolveBaseUrl(req);
  const dashboard = await fetchDashboard(baseUrl, year);
  if (!dashboard) {
    return NextResponse.json(
      { error: "Não foi possível gerar insight diário: dashboard indisponível." },
      { status: 502 },
    );
  }

  const baseReport = buildDailyInsightReport(dashboard, year, runDate);
  const report = await maybeEnhanceDailyInsightWithLlm(baseReport);

  const persistPayload = {
    run_date: runDate,
    year,
    radar_status: report.radarStatus,
    confidence_percent: report.confidencePercent,
    generated_by: report.generatedBy,
    llm_model: report.model,
    headline: report.headline,
    report,
    updated_at: new Date().toISOString(),
  };

  const { error: persistError } = await supabase
    .from("insight_daily_runs")
    .upsert(persistPayload, { onConflict: "run_date,year" });

  if (persistError && isMissingTableError(persistError.message, "insight_daily_runs")) {
    warnings.push("Tabela insight_daily_runs não existe. Insight diário foi gerado sem persistir histórico.");
    return NextResponse.json(buildFallbackDailyInsightPayload(report, warnings), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  }

  if (persistError) {
    return NextResponse.json({ error: persistError.message }, { status: 500 });
  }

  const history = await fetchHistory(year);
  const payload: DailyInsightApiPayload = {
    source: "generated",
    warnings,
    report,
    history,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
