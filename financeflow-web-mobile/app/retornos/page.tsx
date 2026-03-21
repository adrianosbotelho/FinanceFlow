import { ReturnsClient } from "./ReturnsClient";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ReturnsPage({ searchParams }: { searchParams?: { year?: string } }) {
  const year = Number(searchParams?.year ?? new Date().getFullYear());
  const envReady = hasSupabaseServerEnv();
  return <ReturnsClient initialYear={year} envReady={envReady} />;
}
