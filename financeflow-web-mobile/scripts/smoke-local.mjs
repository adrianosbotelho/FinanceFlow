const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const routes = ["/", "/investimentos", "/retornos", "/metas", "/api/health"];

async function check(route) {
  const url = `${base}${route}`;
  const started = Date.now();
  const res = await fetch(url, { redirect: "follow" });
  const latency = Date.now() - started;
  return { route, status: res.status, ok: res.ok, latency };
}

const results = await Promise.allSettled(routes.map((r) => check(r)));
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
console.log("[smoke] SUCESSO: rotas principais responderam.");
