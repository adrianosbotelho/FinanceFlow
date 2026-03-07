import { PerformancePageClient } from "../../components/performance/PerformancePageClient";

interface PageProps {
  searchParams?: { year?: string };
}

export default function PerformancePage({ searchParams }: PageProps) {
  const year =
    searchParams?.year !== undefined
      ? Number(searchParams.year)
      : new Date().getFullYear();

  return <PerformancePageClient initialYear={year} />;
}
