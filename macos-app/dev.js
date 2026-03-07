const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const root = path.join(__dirname, "..");
const PORT = 3000;

function waitFor(url, maxAttempts = 120) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      attempts++;
      http.get(url, { timeout: 2000 }, (res) => resolve()).on("error", () => {
        if (attempts >= maxAttempts) return reject(new Error("Next dev server did not start"));
        setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

console.log("Starting Next.js dev server in repo root...");
const next = spawn("npm", ["run", "dev"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ELECTRON_DEV: "1" },
});

waitFor(`http://127.0.0.1:${PORT}`)
  .then(() => {
    console.log("Starting Electron...");
    spawn(require("electron"), [path.join(__dirname, "main.js")], {
      stdio: "inherit",
      env: { ...process.env, ELECTRON_DEV: "1" },
    });
  })
  .catch((err) => {
    console.error(err.message);
    next.kill();
    process.exit(1);
  });
