import { PerformanceClient } from "./PerformanceClient";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PerformancePage({ searchParams }: { searchParams?: { year?: string } }) {
  const year = Number(searchParams?.year ?? new Date().getFullYear());
  const envReady = hasSupabaseServerEnv();
  return <PerformanceClient initialYear={year} envReady={envReady} />;
}
