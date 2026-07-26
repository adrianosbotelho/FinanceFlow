import { InvestmentosClient } from "./InvestimentosClient";
import { hasSupabaseServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function InvestmentsPage() {
  const envReady = hasSupabaseServerEnv();
  return <InvestmentosClient envReady={envReady} />;
}
