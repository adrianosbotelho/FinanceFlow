import { MetasClient } from "./MetasClient";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function GoalsPage({ searchParams }: { searchParams?: { year?: string } }) {
  const year = Number(searchParams?.year ?? new Date().getFullYear());
  const envReady = hasSupabaseServerEnv();
  return <MetasClient initialYear={year} envReady={envReady} />;
}
