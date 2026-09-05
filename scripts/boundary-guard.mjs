#!/usr/bin/env node

import { execSync } from "node:child_process";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    const [key, value] = arg.slice(2).split("=");
    if (value !== undefined) {
      args.set(key, value);
    } else if (process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
      args.set(key, process.argv[i + 1]);
      i += 1;
    } else {
      args.set(key, "true");
    }
  }
}

const scope = (args.get("scope") || "auto").toLowerCase();
const range = args.get("range");
const outputJson = args.get("json") === "true";

if (!["auto", "macos", "mobile", "both"].includes(scope)) {
  console.error(`[boundary-guard] Escopo inválido: ${scope}`);
  process.exit(2);
}

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function unique(arr) {
  return [...new Set(arr)];
}

function normalizePath(path) {
  return path.trim().replace(/^"+|"+$/g, "");
}

function classifyPath(filePath) {
  if (!filePath) return "unknown";

  if (
    filePath.startsWith("financeflow-web-mobile/") ||
    filePath.startsWith(".github/workflows/web-mobile-") ||
    filePath === ".github/WEB_MOBILE_AUTOMATION_NOTES.md"
  ) {
    return "mobile";
  }

  if (
    filePath.startsWith("app/") ||
    filePath.startsWith("components/") ||
    filePath.startsWith("lib/") ||
    filePath.startsWith("macos-app/") ||
    filePath.startsWith("supabase/") ||
    filePath.startsWith("types/") ||
    filePath.startsWith("scripts/")
  ) {
    return "macos";
  }

  return "shared";
}

function getChangedFiles() {
  if (range) {
    try {
      const out = run(`git diff --name-only --diff-filter=ACMR ${range}`);
      return unique(out.split("\n").map(normalizePath).filter(Boolean));
    } catch (error) {
      const stderr = String(error?.stderr || "");
      const isRangeError =
        stderr.includes("Invalid symmetric difference expression") ||
        stderr.includes("bad revision");

      if (!isRangeError) throw error;

      try {
        const fallback = run("git diff --name-only --diff-filter=ACMR HEAD~1...HEAD");
        return unique(fallback.split("\n").map(normalizePath).filter(Boolean));
      } catch {
        return [];
      }
    }
  }

  const staged = run("git diff --name-only --cached --diff-filter=ACMR")
    .split("\n")
    .map(normalizePath)
    .filter(Boolean);

  const unstaged = run("git diff --name-only --diff-filter=ACMR")
    .split("\n")
    .map(normalizePath)
    .filter(Boolean);

  const untracked = run("git ls-files --others --exclude-standard")
    .split("\n")
    .map(normalizePath)
    .filter(Boolean);

  return unique([...staged, ...unstaged, ...untracked]);
}

const files = getChangedFiles();
const buckets = {
  macos: [],
  mobile: [],
  shared: [],
};

for (const file of files) {
  const bucket = classifyPath(file);
  if (bucket in buckets) buckets[bucket].push(file);
}

const hasMacos = buckets.macos.length > 0;
const hasMobile = buckets.mobile.length > 0;
const hasShared = buckets.shared.length > 0;

let effectiveScope = scope;
if (scope === "auto") {
  if (hasMacos && !hasMobile) {
    effectiveScope = "macos";
  } else if (hasMobile && !hasMacos) {
    effectiveScope = "mobile";
  } else if (!hasMacos && !hasMobile && hasShared) {
    effectiveScope = "both";
  } else if (!hasMacos && !hasMobile && !hasShared) {
    effectiveScope = "both";
  } else {
    effectiveScope = "mixed";
  }
}

let ok = true;
let reason = "ok";

if (effectiveScope === "mixed") {
  ok = false;
  reason = "changes include macos and mobile paths";
}

if (scope === "macos" && hasMobile) {
  ok = false;
  reason = "mobile files changed under macos scope";
}

if (scope === "mobile" && hasMacos) {
  ok = false;
  reason = "macos files changed under mobile scope";
}

const result = {
  ok,
  scopeRequested: scope,
  scopeEffective: effectiveScope,
  reason,
  counts: {
    macos: buckets.macos.length,
    mobile: buckets.mobile.length,
    shared: buckets.shared.length,
    total: files.length,
  },
  files: buckets,
};

if (outputJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`[boundary-guard] scope=${scope} effective=${effectiveScope} status=${ok ? "OK" : "FAIL"}`);
  console.log(
    `[boundary-guard] files total=${result.counts.total} macos=${result.counts.macos} mobile=${result.counts.mobile} shared=${result.counts.shared}`,
  );
  if (buckets.macos.length) {
    console.log("[boundary-guard] macos files:");
    buckets.macos.forEach((f) => console.log(`  - ${f}`));
  }
  if (buckets.mobile.length) {
    console.log("[boundary-guard] mobile files:");
    buckets.mobile.forEach((f) => console.log(`  - ${f}`));
  }
  if (buckets.shared.length) {
    console.log("[boundary-guard] shared files:");
    buckets.shared.forEach((f) => console.log(`  - ${f}`));
  }
  if (!ok) {
    console.error(`[boundary-guard] ${reason}. Use --scope both (or split PR) for cross-scope changes.`);
  }
}

process.exit(ok ? 0 : 1);
