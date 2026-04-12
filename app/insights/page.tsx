import { headers } from "next/headers";
import {
  DailyInsightApiPayload,
  DashboardPayload,
  MarketSnapshotPayload,
  ProfessionalInsightsPayload,
} from "../../types";
import { InsightsPageClient } from "../../components/insights/InsightsPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams?: { year?: string; month?: string };
}

function clampYear(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 2000 || value > fallback) {
    return fallback;
  }
  return value;
}

async function fetchDashboard(
  year: number,
  month: number,
  baseUrl: string,
): Promise<DashboardPayload | null> {
  const res = await fetch(`${baseUrl}/api/dashboard?year=${year}&month=${month}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchDailyInsights(
  year: number,
  month: number,
  baseUrl: string,
): Promise<DailyInsightApiPayload | null> {
  const res = await fetch(`${baseUrl}/api/insights/daily?year=${year}&month=${month}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchMarketSnapshot(baseUrl: string): Promise<MarketSnapshotPayload | null> {
  const res = await fetch(`${baseUrl}/api/insights/market-snapshot`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchProfessionalInsights(
  year: number,
  month: number,
  baseUrl: string,
): Promise<ProfessionalInsightsPayload | null> {
  const res = await fetch(`${baseUrl}/api/insights/professional?year=${year}&month=${month}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function InsightsPage({ searchParams }: PageProps) {
  const now = new Date();
  const yearRaw =
    searchParams?.year !== undefined ? Number(searchParams.year) : now.getFullYear();
  const year = clampYear(yearRaw, now.getFullYear());
  const monthRaw =
    searchParams?.month !== undefined
      ? Number(searchParams.month)
      : now.getMonth() + 1;
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : now.getMonth() + 1;

  const requestHeaders = headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";
  const baseUrl = host ? `${protocol}://${host}` : fallbackBase;
  const [data, dailyInsights, marketSnapshot, professionalInsights] = await Promise.all([
    fetchDashboard(year, month, baseUrl),
    fetchDailyInsights(year, month, baseUrl),
    fetchMarketSnapshot(baseUrl),
    fetchProfessionalInsights(year, month, baseUrl),
  ]);

  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-400">
          Não foi possível carregar os dados de Insights. Verifique as
          configurações do Supabase.
        </p>
      </div>
    );
  }

  return (
    <InsightsPageClient
      data={data}
      dailyInsights={dailyInsights}
      marketSnapshot={marketSnapshot}
      professionalInsights={professionalInsights}
      year={year}
    />
  );
}
