import fs from "node:fs/promises";
import path from "node:path";

const base = process.env.SMOKE_BASE_URL;
const shouldWrite = process.argv.includes("--write");

if (!base || !base.startsWith("http")) {
  console.error(
    "[ops-check] Defina SMOKE_BASE_URL. Exemplo: SMOKE_BASE_URL=https://seu-app.vercel.app",
  );
  process.exit(1);
}

const routes = ["/", "/investimentos", "/retornos", "/metas", "/health", "/api/health"];

async function fetchRoute(route) {
  const startedAt = Date.now();
  const res = await fetch(`${base}${route}`, { redirect: "follow" });
  const latencyMs = Date.now() - startedAt;

  let payload = null;
  if (route === "/api/health") {
    payload = await res.json().catch(() => null);
  }

  return {
    route,
    status: res.status,
    ok: res.ok,
    latencyMs,
    payload,
  };
}

const checks = await Promise.allSettled(routes.map((route) => fetchRoute(route)));

const routeResults = checks.map((check, index) => {
  if (check.status === "rejected") {
    return {
      route: routes[index],
      ok: false,
      status: 0,
      latencyMs: null,
      error: check.reason instanceof Error ? check.reason.message : String(check.reason),
      payload: null,
    };
  }

  return {
    route: check.value.route,
    ok: check.value.ok,
    status: check.value.status,
    latencyMs: check.value.latencyMs,
    error: null,
    payload: check.value.payload,
  };
});

const health = routeResults.find((r) => r.route === "/api/health")?.payload ?? null;
const healthChecks = health?.checks ?? {};
const envOk =
  Boolean(healthChecks.supabaseUrl) &&
  Boolean(healthChecks.supabaseAnon) &&
  Boolean(healthChecks.supabaseServiceRole);
const dbOk = Boolean(healthChecks.dbReachable);

let overall = "ok";
if (!routeResults.every((r) => r.ok)) overall = "degraded";
if (!envOk || !dbOk) overall = "critical";

const report = {
  timestamp: new Date().toISOString(),
  base,
  overall,
  summary: {
    routesOk: routeResults.filter((r) => r.ok).length,
    routesTotal: routeResults.length,
    envOk,
    dbOk,
    dbLatencyMs: health?.metrics?.dbLatencyMs ?? null,
    dbError: health?.errors?.db ?? null,
  },
  routes: routeResults.map((r) => ({
    route: r.route,
    ok: r.ok,
    status: r.status,
    latencyMs: r.latencyMs,
    error: r.error,
  })),
};

for (const r of report.routes) {
  const label = r.ok ? "OK" : "FAIL";
  const latency = r.latencyMs === null ? "-" : `${r.latencyMs}ms`;
  const err = r.error ? ` | ${r.error}` : "";
  console.log(`[ops-check] ${label} ${r.route} -> ${r.status} (${latency})${err}`);
}
console.log(
  `[ops-check] overall=${report.overall} env=${report.summary.envOk ? "OK" : "PENDENTE"} db=${report.summary.dbOk ? "OK" : "PENDENTE"} dbLatency=${report.summary.dbLatencyMs ?? "-"}ms`,
);

if (shouldWrite) {
  const reportsDir = path.join(process.cwd(), "reports");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(
    path.join(reportsDir, `ops-report-${stamp}.json`),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(reportsDir, "ops-report-latest.json"), JSON.stringify(report, null, 2), "utf8");
  console.log("[ops-check] relatorio salvo em reports/.");
}

if (report.overall !== "ok") {
  process.exit(1);
}
