const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_BASE_URL",
  "AUTH_LOGIN_EMAIL",
  "AUTH_LOGIN_PASSWORD",
  "AUTH_SESSION_SECRET",
];

const missing = required.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  console.error("[env-check] Variaveis ausentes:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

console.log("[env-check] OK: todas as variaveis obrigatorias estao definidas.");
