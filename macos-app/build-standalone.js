const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const standaloneSrc = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const publicSrc = path.join(root, "public");
const standaloneOut = path.join(__dirname, "standalone");

console.log("Building Next.js (standalone) in repo root...");
const build = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) {
  process.exit(build.status || 1);
}

if (!fs.existsSync(path.join(standaloneSrc, "server.js"))) {
  console.error("Standalone server.js not found. Check Next.js output.");
  process.exit(1);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log("Copying .next/static and public into standalone...");
const standaloneNext = path.join(standaloneSrc, ".next");
fs.mkdirSync(standaloneNext, { recursive: true });
if (fs.existsSync(staticSrc)) {
  copyRecursive(staticSrc, path.join(standaloneNext, "static"));
}
if (fs.existsSync(publicSrc)) {
  copyRecursive(publicSrc, path.join(standaloneSrc, "public"));
}

console.log("Copying standalone to macos-app/standalone for packaging...");
if (fs.existsSync(standaloneOut)) {
  fs.rmSync(standaloneOut, { recursive: true });
}
copyRecursive(standaloneSrc, standaloneOut);
console.log("Standalone ready for electron-builder.");
