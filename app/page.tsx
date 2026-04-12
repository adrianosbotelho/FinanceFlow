import { DashboardPayload } from "../types";
import { headers } from "next/headers";
import { KPIGrid } from "../components/dashboard/KPIGrid";
import { KPIAdvancedGrid } from "../components/dashboard/KPIAdvancedGrid";
import { PassiveIncomeLineChart } from "../components/dashboard/PassiveIncomeLineChart";
import { MonthlyBarChart } from "../components/dashboard/MonthlyBarChart";
import { YoYLineChart } from "../components/dashboard/YoYLineChart";
import { IncomeDistributionPie } from "../components/dashboard/IncomeDistributionPie";
import { MonthlyTable } from "../components/dashboard/MonthlyTable";
import { MonthOverMonthChart } from "../components/dashboard/MonthOverMonthChart";
import { MonthlyYieldSummaryCard } from "../components/dashboard/MonthlyYieldSummaryCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchDashboard(
  year: number,
  month: number,
  baseUrl: string
): Promise<DashboardPayload | null> {
  const res = await fetch(`${baseUrl}/api/dashboard?year=${year}&month=${month}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    return null;
  }
  return res.json();
}

interface PageProps {
  searchParams?: { year?: string; month?: string };
}

function clampYear(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 2000 || value > fallback) {
    return fallback;
  }
  return value;
}

export default async function DashboardPage({ searchParams }: PageProps) {
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
  const data = await fetchDashboard(year, month, baseUrl);

  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-400">
          Não foi possível carregar os dados do dashboard. Verifique as
          configurações do Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KPIGrid kpis={data.kpis} />
      <KPIAdvancedGrid kpis={data.kpis} />

      <div className="grid gap-6 lg:grid-cols-2">
        <PassiveIncomeLineChart data={data.monthlySeries} />
        <MonthlyBarChart data={data.monthlySeries} />
      </div>

      <MonthOverMonthChart
        data={data.comparisonByMonth}
        yearPrev={year - 1}
        yearCurr={year}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <YoYLineChart data={data.yoySeries} />
        <IncomeDistributionPie distribution={data.distribution} />
      </div>

      <MonthlyYieldSummaryCard summary={data.monthlyYieldSummary} />
      <MonthlyTable data={data.monthlySeries} />
    </div>
  );
}
