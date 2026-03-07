const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");

let serverProcess = null;
const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 20;
const START_TIMEOUT_MS = Number(
  process.env.FINANCEFLOW_SERVER_START_TIMEOUT_MS || 30000
);
const REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const entries = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalIdx = line.indexOf("=");
    if (equalIdx <= 0) continue;
    const key = line.slice(0, equalIdx).trim();
    let value = line.slice(equalIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function loadLocalEnvFiles(standalonePath) {
  const candidates = [];
  const cwd = process.cwd();
  candidates.push(path.join(cwd, ".env.local"), path.join(cwd, ".env"));

  if (standalonePath) {
    candidates.push(
      path.join(standalonePath, ".env.local"),
      path.join(standalonePath, ".env")
    );
  }

  if (!process.env.ELECTRON_DEV && app.isPackaged) {
    const appBundlePath = path.resolve(process.execPath, "..", "..", "..");
    const appParentDir = path.dirname(appBundlePath);
    candidates.push(
      path.join(appParentDir, ".env.local"),
      path.join(appParentDir, ".env")
    );
  }

  for (const filePath of candidates) {
    const parsed = parseEnvFile(filePath);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function validateRequiredEnv() {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
  if (missing.length === 0) return null;
  return `Variáveis obrigatórias ausentes: ${missing.join(
    ", "
  )}.\n\nCrie um .env.local com essas chaves antes de iniciar o app.`;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "127.0.0.1");
  });
}

async function pickPort(preferredPort, maxAttempts) {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = preferredPort + offset;
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortAvailable(port);
    if (free) return port;
  }
  throw new Error(
    `Nenhuma porta livre encontrada no intervalo ${preferredPort}-${
      preferredPort + maxAttempts - 1
    }.`
  );
}

function logRuntime(message) {
  const logPath = path.join(os.homedir(), "Library", "Logs", "FinanceFlow.log");
  try {
    fs.appendFileSync(
      logPath,
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8"
    );
  } catch (_err) {
    // no-op
  }
}

function getStandalonePath() {
  if (process.env.ELECTRON_DEV) {
    return null;
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone");
  }
  const devStandalone = path.join(__dirname, "..", ".next", "standalone");
  return fs.existsSync(path.join(devStandalone, "server.js")) ? devStandalone : null;
}

function waitForServer(url, timeoutMs = START_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const http = require("http");
    const startedAt = Date.now();
    const req = () => {
      const request = http.get(url, { timeout: 1000 }, () => {
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          return reject(
            new Error(
              `Servidor não iniciou em ${Math.round(timeoutMs / 1000)}s (${url}).`
            )
          );
        }
        setTimeout(req, 500);
      });
      request.on("timeout", () => {
        request.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          return reject(
            new Error(
              `Servidor não iniciou em ${Math.round(timeoutMs / 1000)}s (${url}).`
            )
          );
        }
        setTimeout(req, 500);
      });
    };
    req();
  });
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: "FinanceFlow",
  });
  win.loadURL(`http://127.0.0.1:${port}`);
  win.on("closed", () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

async function startServerAndWindow() {
  const standalonePath = getStandalonePath();
  if (process.env.ELECTRON_DEV) {
    const preferredPort = Number(process.env.FINANCEFLOW_PORT || DEFAULT_PORT);
    createWindow(preferredPort);
    return;
  }
  if (!standalonePath) {
    const message =
      "Standalone not found. From repo root run: npm run build. Then from macos-app run: npm start"
    console.error(message);
    dialog.showErrorBox("FinanceFlow", message);
    app.quit();
    return;
  }

  loadLocalEnvFiles(standalonePath);
  const envError = validateRequiredEnv();
  if (envError) {
    console.error(envError);
    logRuntime(envError);
    dialog.showErrorBox("FinanceFlow", envError);
    app.quit();
    return;
  }

  const preferredPort = Number(process.env.FINANCEFLOW_PORT || DEFAULT_PORT);
  let port;
  try {
    port = await pickPort(preferredPort, MAX_PORT_ATTEMPTS);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao selecionar porta.";
    console.error(message);
    logRuntime(message);
    dialog.showErrorBox("FinanceFlow", message);
    app.quit();
    return;
  }

  if (port !== preferredPort) {
    const fallbackMessage = `Porta ${preferredPort} ocupada. Usando ${port}.`;
    console.warn(fallbackMessage);
    logRuntime(fallbackMessage);
  }

  const serverPath = path.join(standalonePath, "server.js");
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
  };
  serverProcess = spawn("node", [serverPath], {
    cwd: standalonePath,
    env,
    stdio: "pipe",
  });
  serverProcess.stderr.on("data", (d) => process.stderr.write(d));
  serverProcess.stdout.on("data", (d) => process.stdout.write(d));
  serverProcess.on("error", (err) => {
    const message = `Server failed to start: ${err.message}`;
    console.error(message);
    logRuntime(message);
    dialog.showErrorBox("FinanceFlow", message);
    app.quit();
  });
  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      const message = `Servidor Next encerrou com código ${code}.`;
      console.error(message);
      logRuntime(message);
      dialog.showErrorBox("FinanceFlow", message);
      app.quit();
    }
  });
  waitForServer(`http://127.0.0.1:${port}`, START_TIMEOUT_MS)
    .then(() => createWindow(port))
    .catch((err) => {
      const message = err.message || "Erro ao iniciar servidor.";
      console.error(message);
      logRuntime(message);
      dialog.showErrorBox("FinanceFlow", message);
      app.quit();
    });
}

app.whenReady().then(startServerAndWindow);

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});

app.on("quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
