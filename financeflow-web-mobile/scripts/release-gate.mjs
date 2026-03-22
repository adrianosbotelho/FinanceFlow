import fs from "node:fs/promises";
import path from "node:path";

const base = process.env.SMOKE_BASE_URL;

if (!base || !base.startsWith("http")) {
  console.error(
    "[release-gate] Defina SMOKE_BASE_URL. Ex: SMOKE_BASE_URL=https://financeflow-web-mobile.vercel.app",
  );
  process.exit(1);
}

const routes = ["/", "/investimentos", "/retornos", "/metas", "/health", "/api/health"];

async function check(route) {
  const started = Date.now();
  const res = await fetch(`${base}${route}`, { redirect: "follow" });
  const latencyMs = Date.now() - started;
  let payload = null;
  if (route === "/api/health") payload = await res.json().catch(() => null);
  return {
    route,
    ok: res.ok,
    status: res.status,
    latencyMs,
    payload,
  };
}

const checks = await Promise.allSettled(routes.map((route) => check(route)));
const results = checks.map((c, i) => {
  if (c.status === "rejected") {
    return {
      route: routes[i],
      ok: false,
      status: 0,
      latencyMs: null,
      error: c.reason instanceof Error ? c.reason.message : String(c.reason),
      payload: null,
    };
  }
  return {
    route: c.value.route,
    ok: c.value.ok,
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
const routesOk = results.every((r) => r.ok);
const gateOk = routesOk && envOk && dbOk;

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
lines.push(`- Env backend OK: ${envOk ? "SIM" : "NAO"}`);
lines.push(`- Banco acessivel OK: ${dbOk ? "SIM" : "NAO"}`);
lines.push(`- Latencia DB (ms): ${health?.metrics?.dbLatencyMs ?? "-"}`);
if (health?.errors?.db) lines.push(`- Erro DB: ${health.errors.db}`);
lines.push("");
lines.push("| Rota | Status | Latencia | Resultado |");
lines.push("| --- | ---: | ---: | --- |");
for (const r of results) {
  const latency = r.latencyMs === null ? "-" : `${r.latencyMs} ms`;
  const outcome = r.ok ? "OK" : `FAIL${r.error ? ` (${r.error})` : ""}`;
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
