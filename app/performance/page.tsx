import { PerformancePageClient } from "../../components/performance/PerformancePageClient";

interface PageProps {
  searchParams?: { year?: string };
}

function clampYear(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 2000 || value > fallback) {
    return fallback;
  }
  return value;
}

export default function PerformancePage({ searchParams }: PageProps) {
  const yearRaw =
    searchParams?.year !== undefined
      ? Number(searchParams.year)
      : new Date().getFullYear();
  const year = clampYear(yearRaw, new Date().getFullYear());

  return <PerformancePageClient initialYear={year} />;
}
