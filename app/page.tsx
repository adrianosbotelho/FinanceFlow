import { DashboardPayload } from "../types";
import { headers } from "next/headers";
import { KPIGrid } from "../components/dashboard/KPIGrid";
import { PassiveIncomeLineChart } from "../components/dashboard/PassiveIncomeLineChart";
import { MonthlyBarChart } from "../components/dashboard/MonthlyBarChart";
import { YoYLineChart } from "../components/dashboard/YoYLineChart";
import { IncomeDistributionPie } from "../components/dashboard/IncomeDistributionPie";
import { MonthlyTable } from "../components/dashboard/MonthlyTable";
import { MonthOverMonthChart } from "../components/dashboard/MonthOverMonthChart";
import { InsightsPanel } from "../components/dashboard/InsightsPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchDashboard(
  year: number,
  baseUrl: string
): Promise<DashboardPayload | null> {
  const res = await fetch(`${baseUrl}/api/dashboard?year=${year}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    return null;
  }
  return res.json();
}

interface PageProps {
  searchParams?: { year?: string };
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const year =
    searchParams?.year !== undefined
      ? Number(searchParams.year)
      : new Date().getFullYear();

  const requestHeaders = headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const fallbackBase = process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000";
  const baseUrl = host ? `${protocol}://${host}` : fallbackBase;
  const data = await fetchDashboard(year, baseUrl);

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MonthlyTable data={data.monthlySeries} />
        <InsightsPanel
          kpis={data.kpis}
          insights={data.insights}
          goalProgress={data.goalProgress}
          alerts={data.alerts}
        />
      </div>
    </div>
  );
}
