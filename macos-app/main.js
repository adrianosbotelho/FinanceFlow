const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
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

function getMissingRequiredEnvKeys() {
  return REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
}

function mergeEnvEntries(entries) {
  for (const [key, value] of Object.entries(entries)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

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

function getPackagedAppParentDir() {
  const appBundlePath = path.resolve(process.execPath, "..", "..", "..");
  return path.dirname(appBundlePath);
}

function getPreferredEnvPath() {
  return path.join(app.getPath("userData"), ".env.local");
}

function getLogPath() {
  return path.join(os.homedir(), "Library", "Logs", "FinanceFlow.log");
}

function ensureEnvTemplateFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, getEnvTemplate(), "utf8");
  }
}

function loadLocalEnvFiles(standalonePath, extraCandidates = []) {
  const candidates = [];
  const cwd = process.cwd();
  candidates.push(path.join(cwd, ".env.local"), path.join(cwd, ".env"));

  candidates.push(getPreferredEnvPath());

  if (standalonePath) {
    candidates.push(
      path.join(standalonePath, ".env.local"),
      path.join(standalonePath, ".env")
    );
  }

  if (!process.env.ELECTRON_DEV && app.isPackaged) {
    const appParentDir = getPackagedAppParentDir();
    candidates.push(
      path.join(appParentDir, ".env.local"),
      path.join(appParentDir, ".env")
    );
  }

  for (const filePath of extraCandidates) {
    candidates.push(filePath);
  }

  for (const filePath of candidates) {
    const parsed = parseEnvFile(filePath);
    mergeEnvEntries(parsed);
  }
}

function validateRequiredEnv() {
  const missing = getMissingRequiredEnvKeys();
  if (missing.length === 0) return null;
  return `Variáveis obrigatórias ausentes: ${missing.join(
    ", "
  )}.\n\nCrie um .env.local com essas chaves antes de iniciar o app.`;
}

function getEnvTemplate() {
  return [
    "NEXT_PUBLIC_SUPABASE_URL=",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "NEXT_PUBLIC_BASE_URL=http://localhost:3000",
    "",
  ].join("\n");
}

async function runFirstBootEnvSetup(standalonePath) {
  const preferredEnvPath = getPreferredEnvPath();
  const appParentDir = app.isPackaged ? getPackagedAppParentDir() : process.cwd();

  while (getMissingRequiredEnvKeys().length > 0) {
    const missing = getMissingRequiredEnvKeys().join(", ");
    const detail = [
      `Variáveis ausentes: ${missing}`,
      "",
      "Escolha uma ação:",
      "1) Selecionar um arquivo .env/.env.local existente",
      "2) Criar template e editar agora",
      "3) Sair",
      "",
      `Local recomendado para salvar: ${preferredEnvPath}`,
      `Local alternativo (ao lado do app): ${path.join(appParentDir, ".env.local")}`,
    ].join("\n");

    const { response } = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Selecionar .env", "Criar template", "Sair"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "FinanceFlow - Configuração inicial",
      message: "Configuração obrigatória do Supabase",
      detail,
    });

    if (response === 2) {
      return false;
    }

    if (response === 0) {
      const selected = await dialog.showOpenDialog({
        title: "Selecione um arquivo .env ou .env.local",
        properties: ["openFile"],
        filters: [{ name: "Env files", extensions: ["env", "local"] }],
      });
      if (selected.canceled || selected.filePaths.length === 0) {
        continue;
      }

      const sourcePath = selected.filePaths[0];
      const parsedSource = parseEnvFile(sourcePath);
      const missingInSource = REQUIRED_ENV_KEYS.filter((k) => !parsedSource[k]);
      if (missingInSource.length > 0) {
        await dialog.showMessageBox({
          type: "error",
          buttons: ["OK"],
          message: "Arquivo selecionado não possui todas as chaves obrigatórias",
          detail: `Faltando: ${missingInSource.join(", ")}`,
        });
        continue;
      }

      fs.mkdirSync(path.dirname(preferredEnvPath), { recursive: true });
      fs.copyFileSync(sourcePath, preferredEnvPath);
      loadLocalEnvFiles(standalonePath, [preferredEnvPath]);
      logRuntime(`Env importado de ${sourcePath} para ${preferredEnvPath}`);
      continue;
    }

    ensureEnvTemplateFile(preferredEnvPath);

    const openResult = await shell.openPath(preferredEnvPath);
    if (openResult) {
      await dialog.showMessageBox({
        type: "error",
        buttons: ["OK"],
        message: "Não foi possível abrir o arquivo de configuração",
        detail: openResult,
      });
      continue;
    }

    await dialog.showMessageBox({
      type: "info",
      buttons: ["Validar agora"],
      defaultId: 0,
      noLink: true,
      message: "Edite e salve o arquivo de configuração",
      detail: `Após salvar ${preferredEnvPath}, clique em "Validar agora".`,
    });

    loadLocalEnvFiles(standalonePath, [preferredEnvPath]);
  }

  return true;
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
  const logPath = getLogPath();
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

async function openConfigFileFromMenu() {
  const envPath = getPreferredEnvPath();
  ensureEnvTemplateFile(envPath);
  const openResult = await shell.openPath(envPath);
  if (openResult) {
    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      message: "Não foi possível abrir o arquivo de configuração",
      detail: openResult,
    });
  }
}

async function openLogFileFromMenu() {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, "", "utf8");
  }
  const openResult = await shell.openPath(logPath);
  if (openResult) {
    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      message: "Não foi possível abrir o log do app",
      detail: openResult,
    });
  }
}

function createApplicationMenu() {
  const template = [
    {
      label: "FinanceFlow",
      submenu: [
        {
          label: "Abrir Configuração (.env.local)",
          click: () => {
            void openConfigFileFromMenu();
          },
        },
        {
          label: "Abrir Logs",
          click: () => {
            void openLogFileFromMenu();
          },
        },
        { type: "separator" },
        { role: "quit", label: "Sair do FinanceFlow" },
      ],
    },
    {
      label: "Janela",
      submenu: [
        { role: "reload", label: "Recarregar" },
        { role: "toggleDevTools", label: "DevTools" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
  const envReady = await runFirstBootEnvSetup(standalonePath);
  const envError = validateRequiredEnv();
  if (!envReady || envError) {
    const message = envError || "Configuração cancelada pelo usuário.";
    console.error(message);
    logRuntime(message);
    if (envError) dialog.showErrorBox("FinanceFlow", envError);
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
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: standalonePath,
    env: {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
    },
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

app.whenReady().then(() => {
  createApplicationMenu();
  return startServerAndWindow();
});

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
