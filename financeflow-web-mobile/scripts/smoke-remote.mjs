const base = process.env.SMOKE_BASE_URL;
const authEmail = process.env.AUTH_EMAIL;
const authPassword = process.env.AUTH_PASSWORD;

if (!base || !base.startsWith("http")) {
  console.error(
    "[smoke-remote] Defina SMOKE_BASE_URL com a URL do deploy, ex: https://financeflow-web-mobile.vercel.app",
  );
  process.exit(1);
}

const structuralRoutes = ["/", "/investimentos", "/retornos", "/metas", "/health", "/api/health"];
const loginRoute = "/login";

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
  if (!setCookie) {
    throw new Error("Falha no login técnico: cookie de sessão ausente.");
  }
  return setCookie.split(";")[0];
}

async function check(route, cookie) {
  const started = Date.now();
  const url = `${base}${route}`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  return {
    route,
    status: res.status,
    ok: res.ok || isRedirectToLogin(res),
    redirectedToLogin: isRedirectToLogin(res),
    latency: Date.now() - started,
    body: route === "/api/health" ? await res.json().catch(() => null) : null,
  };
}

let failed = false;
let cookie = null;

try {
  cookie = await loginAndGetCookie();
} catch (error) {
  failed = true;
  console.error(`[smoke-remote] FAIL login técnico: ${error instanceof Error ? error.message : error}`);
}

try {
  const loginCheck = await check(loginRoute, null);
  console.log(
    `[smoke-remote] ${loginCheck.ok ? "OK" : "FAIL"} ${loginRoute} -> ${loginCheck.status} (${loginCheck.latency}ms)`,
  );
  if (!loginCheck.ok) failed = true;
} catch (error) {
  failed = true;
  console.error(`[smoke-remote] FAIL ${loginRoute}:`, error instanceof Error ? error.message : error);
}

for (const route of structuralRoutes) {
  try {
    const out = await check(route, cookie);
    const shouldBeGuarded = route !== "/api/health";
    const validWithoutAuth = !cookie && shouldBeGuarded ? out.redirectedToLogin : out.ok;
    const finalOk = cookie ? out.ok : validWithoutAuth || out.ok;
    console.log(
      `[smoke-remote] ${finalOk ? "OK" : "FAIL"} ${route} -> ${out.status} (${out.latency}ms)`,
    );
    if (!finalOk) failed = true;
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
