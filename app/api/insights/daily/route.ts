import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import {
  buildDailyInsightDataSignature,
  buildDailyInsightReport,
  buildFallbackDailyInsightPayload,
  getSaoPauloDateISO,
  maybeEnhanceDailyInsightWithLlm,
  summarizeHistoryFromRows,
} from "../../../../lib/daily-insights-agent";
import {
  DailyInsightApiPayload,
  DailyInsightGoalContext,
  DailyInsightReport,
  DashboardPayload,
} from "../../../../types";

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

async function fetchDashboardByPeriod(
  baseUrl: string,
  year: number,
  month: number,
): Promise<DashboardPayload | null> {
  try {
    const res = await fetch(`${baseUrl}/api/dashboard?year=${year}&month=${month}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardPayload;
  } catch {
    return null;
  }
}

async function fetchGoalContext(
  year: number,
  month: number,
  dashboard: DashboardPayload,
): Promise<{ context: DailyInsightGoalContext; warnings: string[] }> {
  const warnings: string[] = [];
  const monthlyTargetRes = await supabase
    .from("investment_goals_monthly")
    .select("monthly_target")
    .eq("year", year)
    .eq("month", month);
  const annualTargetRes = await supabase
    .from("investment_goals_annual")
    .select("annual_target")
    .eq("year", year);

  const monthlyTargetRows = monthlyTargetRes.data ?? [];
  const annualTargetRows = annualTargetRes.data ?? [];

  if (monthlyTargetRes.error) {
    if (isMissingTableError(monthlyTargetRes.error.message, "investment_goals_monthly")) {
      warnings.push("Tabela investment_goals_monthly não existe. Meta mensal não considerada.");
    } else {
      warnings.push(`Falha ao ler meta mensal: ${monthlyTargetRes.error.message}`);
    }
  }
  if (annualTargetRes.error) {
    if (isMissingTableError(annualTargetRes.error.message, "investment_goals_annual")) {
      warnings.push("Tabela investment_goals_annual não existe. Meta anual não considerada.");
    } else {
      warnings.push(`Falha ao ler meta anual: ${annualTargetRes.error.message}`);
    }
  }

  const monthlyIncomeTarget = monthlyTargetRows.reduce(
    (acc, row) => acc + Number((row as { monthly_target?: number }).monthly_target ?? 0),
    0,
  );
  const annualCapitalTarget = annualTargetRows.reduce(
    (acc, row) => acc + Number((row as { annual_target?: number }).annual_target ?? 0),
    0,
  );
  const monthlyIncomeRealized = Number(dashboard.kpis.cdbTotalYieldCurrentMonth ?? 0);
  const annualCapitalCurrent = Number(dashboard.kpis.investedCapital ?? 0);
  const monthlyTargetOrNull = monthlyIncomeTarget > 0 ? monthlyIncomeTarget : null;
  const annualTargetOrNull = annualCapitalTarget > 0 ? annualCapitalTarget : null;

  const context: DailyInsightGoalContext = {
    month,
    monthlyIncomeTarget: monthlyTargetOrNull,
    monthlyIncomeRealized,
    monthlyIncomeGap:
      monthlyTargetOrNull === null ? null : Math.max(monthlyTargetOrNull - monthlyIncomeRealized, 0),
    monthlyIncomeProgressPercent:
      monthlyTargetOrNull === null || monthlyTargetOrNull <= 0
        ? null
        : (monthlyIncomeRealized / monthlyTargetOrNull) * 100,
    annualCapitalTarget: annualTargetOrNull,
    annualCapitalCurrent,
    annualCapitalGap:
      annualTargetOrNull === null ? null : Math.max(annualTargetOrNull - annualCapitalCurrent, 0),
    annualCapitalProgressPercent:
      annualTargetOrNull === null || annualTargetOrNull <= 0
        ? null
        : (annualCapitalCurrent / annualTargetOrNull) * 100,
  };

  return { context, warnings };
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
  const now = new Date();
  const year = Number(searchParams.get("year") ?? now.getFullYear());
  const monthRaw = Number(searchParams.get("month") ?? now.getMonth() + 1);
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : now.getMonth() + 1;
  const force = searchParams.get("force") === "1";
  const runDate = getSaoPauloDateISO();
  const warnings: string[] = [];

  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "year inválido." }, { status: 400 });
  }

  const baseUrl = resolveBaseUrl(req);
  const dashboard = await fetchDashboardByPeriod(baseUrl, year, month);
  const dashboardFallback = dashboard ? null : await fetchDashboard(baseUrl, year);
  const dashboardPayload = dashboard ?? dashboardFallback;
  if (!dashboardPayload) {
    return NextResponse.json(
      { error: "Não foi possível gerar insight diário: dashboard indisponível." },
      { status: 502 },
    );
  }

  if (!dashboard) {
    warnings.push(
      "Falha ao carregar dashboard por mês selecionado; usando contexto anual como fallback.",
    );
  }

  const goalContextPayload = await fetchGoalContext(year, month, dashboardPayload);
  warnings.push(...goalContextPayload.warnings);
  const goalContext = goalContextPayload.context;

  const currentDataSignature = buildDailyInsightDataSignature(dashboardPayload, goalContext);

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
        const cachedSignature =
          typeof (cachedReport as { dataSignature?: unknown }).dataSignature === "string"
            ? String((cachedReport as { dataSignature?: unknown }).dataSignature)
            : null;
        const canUseCache =
          cachedSignature !== null && cachedSignature === currentDataSignature;

        if (canUseCache) {
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

        warnings.push("Dados da carteira mudaram; insight diário recalculado.");
      }
    }
  }

  const baseReport = buildDailyInsightReport(dashboardPayload, year, month, runDate, goalContext);
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
