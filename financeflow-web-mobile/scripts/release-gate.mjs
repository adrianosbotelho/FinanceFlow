import fs from "node:fs/promises";
import path from "node:path";

const base = process.env.SMOKE_BASE_URL;
const authEmail = process.env.AUTH_EMAIL;
const authPassword = process.env.AUTH_PASSWORD;

if (!base || !base.startsWith("http")) {
  console.error(
    "[release-gate] Defina SMOKE_BASE_URL. Ex: SMOKE_BASE_URL=https://financeflow-web-mobile.vercel.app",
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
  if (!setCookie) {
    throw new Error("Falha no login técnico: cookie ausente.");
  }
  return setCookie.split(";")[0];
}

async function check(route, cookie) {
  const started = Date.now();
  const res = await fetch(`${base}${route}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  const latencyMs = Date.now() - started;
  let payload = null;
  if (route === "/api/health") payload = await res.json().catch(() => null);
  return {
    route,
    ok: res.ok,
    redirectedToLogin: isRedirectToLogin(res),
    status: res.status,
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

const checks = await Promise.allSettled(routes.map((route) => check(route, cookie)));
const results = checks.map((c, i) => {
  if (c.status === "rejected") {
    return {
      route: routes[i],
      ok: false,
      redirectedToLogin: false,
      status: 0,
      latencyMs: null,
      error: c.reason instanceof Error ? c.reason.message : String(c.reason),
      payload: null,
    };
  }
  return {
    route: c.value.route,
    ok: c.value.ok,
    redirectedToLogin: c.value.redirectedToLogin,
    status: c.value.status,
    latencyMs: c.value.latencyMs,
    error: null,
    payload: c.value.payload,
  };
});

const health = results.find((r) => r.route === "/api/health")?.payload ?? null;
const envOk =
  Boolean(health?.checks?.supabaseUrl) &&
  Boolean(health?.checks?.supabaseAnon) &&
  Boolean(health?.checks?.supabaseServiceRole);
const dbOk = Boolean(health?.checks?.dbReachable);
const routesOk = results.every((r) => {
  if (cookie) return r.ok;
  if (r.route === "/login" || r.route === "/api/health") return r.ok;
  return r.ok || r.redirectedToLogin;
});
const gateOk = routesOk && envOk && dbOk && !loginError;

const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const reportsDir = path.join(process.cwd(), "reports");
await fs.mkdir(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, `release-gate-${stamp}.md`);

const lines = [];
lines.push("# Release Gate Report");
lines.push("");
lines.push(`- Data/Hora: ${now.toISOString()}`);
lines.push(`- Base URL: ${base}`);
lines.push(`- Resultado geral: **${gateOk ? "APROVADO" : "BLOQUEADO"}**`);
lines.push("");
lines.push("## Gate tecnico");
lines.push("");
lines.push(`- Rotas principais OK: ${routesOk ? "SIM" : "NAO"}`);
lines.push(`- Modo de validacao auth: ${cookie ? "autenticado" : "guard-check (sem credenciais)"}`);
lines.push(`- Login tecnico: ${loginError ? `FALHA (${loginError})` : cookie ? "OK" : "nao executado"}`);
lines.push(`- Env backend OK: ${envOk ? "SIM" : "NAO"}`);
lines.push(`- Banco acessivel OK: ${dbOk ? "SIM" : "NAO"}`);
lines.push(`- Latencia DB (ms): ${health?.metrics?.dbLatencyMs ?? "-"}`);
if (health?.errors?.db) lines.push(`- Erro DB: ${health.errors.db}`);
lines.push("");
lines.push("| Rota | Status | Latencia | Resultado |");
lines.push("| --- | ---: | ---: | --- |");
for (const r of results) {
  const latency = r.latencyMs === null ? "-" : `${r.latencyMs} ms`;
  const finalOk =
    cookie || r.route === "/login" || r.route === "/api/health"
      ? r.ok
      : r.ok || r.redirectedToLogin;
  const outcome = finalOk ? "OK" : `FAIL${r.error ? ` (${r.error})` : ""}`;
  lines.push(`| ${r.route} | ${r.status} | ${latency} | ${outcome} |`);
}
lines.push("");
lines.push("## Checklist manual iPhone (preencher)");
lines.push("");
lines.push("- [ ] Abrir no Safari iOS");
lines.push("- [ ] Adicionar a Tela de Inicio");
lines.push("- [ ] Abrir em modo standalone");
lines.push("- [ ] Navegar Dashboard/Retornos/Investimentos/Metas/Health");
lines.push("- [ ] CRUD de Retornos (incluir/editar/excluir)");
lines.push("- [ ] Validar fallback offline");
lines.push("");
lines.push("## Decisao");
lines.push("");
lines.push(
  gateOk
    ? "- Tecnico aprovado. Liberar apos checklist manual iPhone."
    : "- Tecnico bloqueado. Corrigir falhas antes de liberar.",
);

await fs.writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
await fs.writeFile(path.join(reportsDir, "release-gate-latest.md"), `${lines.join("\n")}\n`, "utf8");

console.log(`[release-gate] Relatorio salvo: ${reportPath}`);
console.log(`[release-gate] Resultado: ${gateOk ? "APROVADO" : "BLOQUEADO"}`);

if (!gateOk) process.exit(1);
