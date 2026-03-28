import fs from "node:fs/promises";
import path from "node:path";

const base = process.env.SMOKE_BASE_URL;
const shouldWrite = process.argv.includes("--write");
const authEmail = process.env.AUTH_EMAIL;
const authPassword = process.env.AUTH_PASSWORD;

if (!base || !base.startsWith("http")) {
  console.error(
    "[ops-check] Defina SMOKE_BASE_URL. Exemplo: SMOKE_BASE_URL=https://seu-app.vercel.app",
  );
  process.exit(1);
}

const routes = ["/login", "/", "/investimentos", "/retornos", "/metas", "/health", "/api/health"];

function isRedirectToLogin(res) {
  const location = res.headers.get("location") ?? "";
  return [301, 302, 303, 307, 308].includes(res.status) && location.includes("/login");
}

async function loginAndGetCookie() {
  if (!authEmail || !authPassword) return null;
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: authEmail, password: authPassword }),
    redirect: "manual",
  });
  if (!res.ok) {
    throw new Error(`Falha no login técnico: HTTP ${res.status}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Falha no login técnico: cookie ausente.");
  return setCookie.split(";")[0];
}

async function fetchRoute(route, cookie) {
  const startedAt = Date.now();
  const res = await fetch(`${base}${route}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  const latencyMs = Date.now() - startedAt;

  let payload = null;
  if (route === "/api/health") {
    payload = await res.json().catch(() => null);
  }

  return {
    route,
    status: res.status,
    ok: res.ok,
    redirectedToLogin: isRedirectToLogin(res),
    latencyMs,
    payload,
  };
}

let cookie = null;
let loginError = null;
try {
  cookie = await loginAndGetCookie();
} catch (error) {
  loginError = error instanceof Error ? error.message : String(error);
}

const checks = await Promise.allSettled(routes.map((route) => fetchRoute(route, cookie)));

const routeResults = checks.map((check, index) => {
  if (check.status === "rejected") {
    return {
      route: routes[index],
      ok: false,
      redirectedToLogin: false,
      status: 0,
      latencyMs: null,
      error: check.reason instanceof Error ? check.reason.message : String(check.reason),
      payload: null,
    };
  }

  return {
    route: check.value.route,
    ok: check.value.ok,
    redirectedToLogin: check.value.redirectedToLogin,
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

const routesOk = routeResults.every((r) => {
  if (cookie) return r.ok;
  if (r.route === "/login" || r.route === "/api/health") return r.ok;
  return r.redirectedToLogin || r.ok;
});

let overall = "ok";
if (!routesOk) overall = "degraded";
if (!envOk || !dbOk) overall = "critical";
if (loginError) overall = "critical";

const report = {
  timestamp: new Date().toISOString(),
  base,
  overall,
  summary: {
    routesOk: routeResults.filter((r) => r.ok).length,
    routesTotal: routeResults.length,
    authMode: cookie ? "authenticated" : "guard-check",
    loginError,
    envOk,
    dbOk,
    dbLatencyMs: health?.metrics?.dbLatencyMs ?? null,
    dbError: health?.errors?.db ?? null,
  },
  routes: routeResults.map((r) => ({
    route: r.route,
    ok: r.ok,
    redirectedToLogin: r.redirectedToLogin,
    status: r.status,
    latencyMs: r.latencyMs,
    error: r.error,
  })),
};

for (const r of report.routes) {
  const allowGuard = !cookie && r.route !== "/login" && r.route !== "/api/health";
  const finalOk = allowGuard ? r.ok || r.status === 307 || r.status === 302 : r.ok;
  const label = finalOk ? "OK" : "FAIL";
  const latency = r.latencyMs === null ? "-" : `${r.latencyMs}ms`;
  const err = r.error ? ` | ${r.error}` : "";
  console.log(`[ops-check] ${label} ${r.route} -> ${r.status} (${latency})${err}`);
}
if (loginError) {
  console.error(`[ops-check] FAIL login técnico: ${loginError}`);
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
