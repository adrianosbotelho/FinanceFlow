import { PerformanceHistoryPageClient } from "../../components/history-performance/PerformanceHistoryPageClient";

interface PageProps {
  searchParams?: { year?: string; month?: string };
}

function clampMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return new Date().getMonth() + 1;
  }
  return month;
}

function clampYear(year: number, fallback: number): number {
  if (!Number.isInteger(year) || year < 2000 || year > fallback) {
    return fallback;
  }
  return year;
}

export default function HistoryPerformancePage({ searchParams }: PageProps) {
  const now = new Date();
  const initialYearRaw = Number(searchParams?.year);
  const initialYear = clampYear(initialYearRaw, now.getFullYear());
  const initialMonthRaw = Number(searchParams?.month);
  const initialMonth = clampMonth(initialMonthRaw);

  return (
    <PerformanceHistoryPageClient
      initialYear={initialYear}
      initialMonth={initialMonth}
    />
  );
}
