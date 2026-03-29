const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const uiRoutes = ["/login", "/", "/investimentos", "/retornos", "/metas", "/health", "/api/health"];
const apiRoutes = [
  "/api/dashboard?year=2026",
  "/api/investments",
  "/api/returns?year=2026",
  "/api/goals?year=2026&month=3",
];
const authEmail = process.env.AUTH_EMAIL;
const authPassword = process.env.AUTH_PASSWORD;

function isRedirectToLogin(res) {
  const location = res.headers.get("location") ?? "";
  return [301, 302, 303, 307, 308].includes(res.status) && location.includes("/login");
}

async function loginAndGetCookie() {
  if (!authEmail || !authPassword) return null;
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Referer: `${base}/login`,
    },
    body: JSON.stringify({ email: authEmail, password: authPassword }),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`Falha no login técnico: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Falha no login técnico: cookie ausente.");
  return setCookie.split(";")[0];
}

async function check(route, cookie) {
  const url = `${base}${route}`;
  const started = Date.now();
  const res = await fetch(url, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  const latency = Date.now() - started;
  return { route, status: res.status, ok: res.ok, redirectedToLogin: isRedirectToLogin(res), latency };
}

let cookie = null;
let loginFailure = null;
try {
  cookie = await loginAndGetCookie();
} catch (error) {
  loginFailure = error instanceof Error ? error.message : String(error);
}

const results = await Promise.allSettled(uiRoutes.map((r) => check(r, cookie)));
let failed = false;
if (loginFailure) {
  failed = true;
  console.error(`[smoke] FAIL login técnico: ${loginFailure}`);
}

for (const r of results) {
  if (r.status === "rejected") {
    failed = true;
    console.error(`[smoke] FAIL: ${r.reason}`);
    continue;
  }
  const route = r.value.route;
  const requiresAuth = !["/login", "/api/health"].includes(route);
  const finalOk = cookie ? r.value.ok : requiresAuth ? r.value.redirectedToLogin : r.value.ok;
  const line = `[smoke] ${finalOk ? "OK" : "FAIL"} ${route} -> ${r.value.status} (${r.value.latency}ms)`;
  if (!finalOk) failed = true;
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

const apiResults = await Promise.allSettled(apiRoutes.map((r) => check(r, cookie)));
for (const r of apiResults) {
  if (r.status === "rejected") {
    failed = true;
    console.error(`[smoke] FAIL: ${r.reason}`);
    continue;
  }
  const finalOk = cookie ? r.value.ok : r.value.status === 401;
  const line = `[smoke] ${finalOk ? "OK" : "FAIL"} ${r.value.route} -> ${r.value.status} (${r.value.latency}ms)`;
  if (!finalOk) failed = true;
  console.log(line);
}

if (failed) process.exit(1);
console.log("[smoke] SUCESSO: rotas principais e APIs de dados responderam.");
