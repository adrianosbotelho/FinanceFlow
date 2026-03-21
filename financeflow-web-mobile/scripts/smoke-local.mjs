const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const uiRoutes = ["/", "/investimentos", "/retornos", "/metas", "/health", "/api/health"];
const apiRoutes = [
  "/api/dashboard?year=2026",
  "/api/investments",
  "/api/returns?year=2026",
  "/api/goals?year=2026&month=3",
];

async function check(route) {
  const url = `${base}${route}`;
  const started = Date.now();
  const res = await fetch(url, { redirect: "follow" });
  const latency = Date.now() - started;
  return { route, status: res.status, ok: res.ok, latency };
}

const results = await Promise.allSettled(uiRoutes.map((r) => check(r)));
let failed = false;

for (const r of results) {
  if (r.status === "rejected") {
    failed = true;
    console.error(`[smoke] FAIL: ${r.reason}`);
    continue;
  }
  const line = `[smoke] ${r.value.ok ? "OK" : "FAIL"} ${r.value.route} -> ${r.value.status} (${r.value.latency}ms)`;
  if (!r.value.ok) failed = true;
  console.log(line);
}

if (failed) process.exit(1);

const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => null);
const envReady =
  Boolean(health?.checks?.supabaseUrl) &&
  Boolean(health?.checks?.supabaseAnon) &&
  Boolean(health?.checks?.supabaseServiceRole);

if (!envReady) {
  console.log(
    "[smoke] AVISO: env Supabase incompleto. APIs de dados nao foram validadas neste smoke.",
  );
  console.log("[smoke] SUCESSO PARCIAL: rotas estruturais responderam.");
  process.exit(0);
}

const apiResults = await Promise.allSettled(apiRoutes.map((r) => check(r)));
for (const r of apiResults) {
  if (r.status === "rejected") {
    failed = true;
    console.error(`[smoke] FAIL: ${r.reason}`);
    continue;
  }
  const line = `[smoke] ${r.value.ok ? "OK" : "FAIL"} ${r.value.route} -> ${r.value.status} (${r.value.latency}ms)`;
  if (!r.value.ok) failed = true;
  console.log(line);
}

if (failed) process.exit(1);
console.log("[smoke] SUCESSO: rotas principais e APIs de dados responderam.");
