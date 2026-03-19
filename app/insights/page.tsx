import { headers } from "next/headers";
import {
  DailyInsightApiPayload,
  DashboardPayload,
  MarketSnapshotPayload,
} from "../../types";
import { InsightsPageClient } from "../../components/insights/InsightsPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams?: { year?: string };
}

async function fetchDashboard(
  year: number,
  baseUrl: string,
): Promise<DashboardPayload | null> {
  const res = await fetch(`${baseUrl}/api/dashboard?year=${year}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchDailyInsights(
  year: number,
  baseUrl: string,
): Promise<DailyInsightApiPayload | null> {
  const res = await fetch(`${baseUrl}/api/insights/daily?year=${year}`, {
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

export default async function InsightsPage({ searchParams }: PageProps) {
  const year =
    searchParams?.year !== undefined
      ? Number(searchParams.year)
      : new Date().getFullYear();

  const requestHeaders = headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";
  const baseUrl = host ? `${protocol}://${host}` : fallbackBase;
  const [data, dailyInsights, marketSnapshot] = await Promise.all([
    fetchDashboard(year, baseUrl),
    fetchDailyInsights(year, baseUrl),
    fetchMarketSnapshot(baseUrl),
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
      year={year}
    />
  );
}
