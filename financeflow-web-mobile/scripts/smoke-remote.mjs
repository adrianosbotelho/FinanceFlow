const base = process.env.SMOKE_BASE_URL;

if (!base || !base.startsWith("http")) {
  console.error(
    "[smoke-remote] Defina SMOKE_BASE_URL com a URL do deploy, ex: https://financeflow-web-mobile.vercel.app",
  );
  process.exit(1);
}

const structuralRoutes = ["/", "/investimentos", "/retornos", "/metas", "/health", "/api/health"];

async function check(route) {
  const started = Date.now();
  const url = `${base}${route}`;
  const res = await fetch(url, { redirect: "follow" });
  return {
    route,
    status: res.status,
    ok: res.ok,
    latency: Date.now() - started,
    body: route === "/api/health" ? await res.json().catch(() => null) : null,
  };
}

let failed = false;

for (const route of structuralRoutes) {
  try {
    const out = await check(route);
    console.log(
      `[smoke-remote] ${out.ok ? "OK" : "FAIL"} ${route} -> ${out.status} (${out.latency}ms)`,
    );
    if (!out.ok) failed = true;
    if (route === "/api/health" && out.body) {
      const checks = out.body.checks ?? {};
      const envOk =
        Boolean(checks.supabaseUrl) &&
        Boolean(checks.supabaseAnon) &&
        Boolean(checks.supabaseServiceRole);
      const dbOk = Boolean(checks.dbReachable);
      console.log(
        `[smoke-remote] health env=${envOk ? "OK" : "PENDENTE"} db=${dbOk ? "OK" : "PENDENTE"} latencyDb=${out.body?.metrics?.dbLatencyMs ?? "-"}ms`,
      );
      if (!envOk || !dbOk) {
        failed = true;
        if (out.body?.errors?.db) {
          console.error(`[smoke-remote] db error: ${out.body.errors.db}`);
        }
      }
    }
  } catch (error) {
    failed = true;
    console.error(`[smoke-remote] FAIL ${route}:`, error instanceof Error ? error.message : error);
  }
}

if (failed) {
  process.exit(1);
}

console.log("[smoke-remote] SUCESSO: deploy pronto para uso.");
