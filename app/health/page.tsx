import { HealthCheckPageClient } from "../../components/health/HealthCheckPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HealthPage() {
  return <HealthCheckPageClient />;
}
