const { app, BrowserWindow, dialog, shell, Menu, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");
const os = require("os");

let serverStarted = false;
let currentServerPort = null;
let mainWindow = null;
const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 20;
const LOG_MAX_BYTES = 5 * 1024 * 1024;
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

function rotateLogIfNeeded(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const { size } = fs.statSync(logPath);
    if (size < LOG_MAX_BYTES) return;
    const backupPath = `${logPath}.1`;
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { force: true });
    }
    fs.renameSync(logPath, backupPath);
  } catch (_err) {
    // no-op
  }
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
    rotateLogIfNeeded(logPath);
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

async function openDiagnosticsFromMenu() {
  const missingEnv = getMissingRequiredEnvKeys();
  const preferredEnv = getPreferredEnvPath();
  const logPath = getLogPath();
  const standalonePath = getStandalonePath();
  const openAtLogin = app.getLoginItemSettings().openAtLogin;

  const lines = [
    `Status do servidor: ${serverStarted ? "rodando" : "parado"}`,
    `Porta em uso: ${currentServerPort ?? "-"}`,
    `Abrir no login: ${openAtLogin ? "ativado" : "desativado"}`,
    `Env obrigatório: ${missingEnv.length === 0 ? "OK" : `faltando (${missingEnv.join(", ")})`}`,
    `Arquivo env preferencial: ${preferredEnv}`,
    `Arquivo env existe: ${fs.existsSync(preferredEnv) ? "sim" : "não"}`,
    `Standalone path: ${standalonePath ?? "-"}`,
    `Log path: ${logPath}`,
  ];

  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Copiar diagnóstico", "OK"],
    defaultId: 1,
    cancelId: 1,
    title: "FinanceFlow - Diagnóstico",
    message: "Diagnóstico rápido do app macOS",
    detail: lines.join("\n"),
  });
  if (response === 0) {
    clipboard.writeText(lines.join("\n"));
  }
}

async function runLocalHealthCheckFromMenu() {
  if (!currentServerPort) {
    await dialog.showMessageBox({
      type: "warning",
      buttons: ["OK"],
      message: "Servidor local ainda não está pronto",
      detail: "Aguarde o app carregar e tente novamente.",
    });
    return;
  }

  const endpoints = [
    `/api/investments`,
    `/api/returns`,
    `/api/dashboard?year=${new Date().getFullYear()}`,
  ];

  const baseUrl = `http://127.0.0.1:${currentServerPort}`;
  const results = [];

  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      await fetchJson(`${baseUrl}${endpoint}`);
      results.push({
        endpoint,
        status: "OK",
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      results.push({
        endpoint,
        status: "ERRO",
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : "Falha desconhecida",
      });
    }
  }

  const hasError = results.some((r) => r.status !== "OK");
  const lines = results.map((r) =>
    r.status === "OK"
      ? `${r.endpoint}: OK (${r.latencyMs}ms)`
      : `${r.endpoint}: ERRO (${r.latencyMs}ms) - ${r.error}`
  );
  const summary = hasError
    ? "Health check com falhas"
    : "Health check OK";

  logRuntime(
    `${summary}: ${lines.join(" | ")}`
  );

  await dialog.showMessageBox({
    type: hasError ? "warning" : "info",
    buttons: ["OK"],
    message: summary,
    detail: lines.join("\n"),
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`Falha ao buscar ${url}: status ${res.statusCode ?? "?"}`));
        res.resume();
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Resposta inválida em ${url}: ${err.message}`));
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout ao buscar ${url}`));
    });
  });
}

function sendJson(url, method, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          let parsedBody = null;
          try {
            parsedBody = responseBody ? JSON.parse(responseBody) : null;
          } catch (_err) {
            // no-op
          }
          if (!res.statusCode || res.statusCode >= 400) {
            const errorMessage =
              parsedBody?.error ||
              `Falha em ${method} ${url}: status ${res.statusCode ?? "?"}`;
            reject(new Error(errorMessage));
            return;
          }
          resolve(parsedBody);
        });
      }
    );
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout em ${method} ${url}`));
    });
    req.write(payload);
    req.end();
  });
}

async function exportDataBackupFromMenu() {
  if (!currentServerPort) {
    await dialog.showMessageBox({
      type: "warning",
      buttons: ["OK"],
      message: "Servidor local ainda não está pronto",
      detail: "Aguarde o app carregar e tente novamente.",
    });
    return;
  }

  const defaultPath = path.join(
    app.getPath("documents"),
    `financeflow-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );

  const saveResult = await dialog.showSaveDialog({
    title: "Exportar backup de dados",
    defaultPath,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return;
  }

  try {
    const baseUrl = `http://127.0.0.1:${currentServerPort}`;
    const [investments, returns, closures] = await Promise.all([
      fetchJson(`${baseUrl}/api/investments`),
      fetchJson(`${baseUrl}/api/returns`),
      fetchJson(`${baseUrl}/api/monthly-closures`),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      source: "FinanceFlow macOS app",
      investments,
      monthlyReturns: returns,
      monthlyClosures: closures,
    };

    fs.writeFileSync(saveResult.filePath, JSON.stringify(payload, null, 2), "utf8");
    logRuntime(`Backup exportado em ${saveResult.filePath}`);

    await dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      message: "Backup exportado com sucesso",
      detail: saveResult.filePath,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao exportar backup.";
    logRuntime(message);
    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      message: "Falha ao exportar backup",
      detail: message,
    });
  }
}

function normalizeBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Arquivo inválido: formato de backup não reconhecido.");
  }
  const investments = Array.isArray(payload.investments) ? payload.investments : [];
  const monthlyReturns = Array.isArray(payload.monthlyReturns)
    ? payload.monthlyReturns
    : [];
  const monthlyClosures = Array.isArray(payload.monthlyClosures)
    ? payload.monthlyClosures
    : [];
  return { investments, monthlyReturns, monthlyClosures };
}

async function importDataBackupFromMenu() {
  if (!currentServerPort) {
    await dialog.showMessageBox({
      type: "warning",
      buttons: ["OK"],
      message: "Servidor local ainda não está pronto",
      detail: "Aguarde o app carregar e tente novamente.",
    });
    return;
  }

  const selected = await dialog.showOpenDialog({
    title: "Importar backup de dados",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (selected.canceled || selected.filePaths.length === 0) {
    return;
  }

  const backupPath = selected.filePaths[0];
  const { response: confirm } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancelar", "Importar (merge)"],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
    message: "Importar backup no banco atual",
    detail:
      "A importação faz merge/upsert de dados (não apaga registros existentes).",
  });
  if (confirm !== 1) {
    return;
  }

  try {
    const raw = fs.readFileSync(backupPath, "utf8");
    const parsed = JSON.parse(raw);
    const { investments, monthlyReturns, monthlyClosures } =
      normalizeBackupPayload(parsed);

    const baseUrl = `http://127.0.0.1:${currentServerPort}`;
    const existingInvestments = await fetchJson(`${baseUrl}/api/investments`);
    const existingIds = new Set(
      Array.isArray(existingInvestments)
        ? existingInvestments.map((i) => i.id).filter(Boolean)
        : []
    );

    for (const inv of investments) {
      if (!inv?.id) continue;
      if (existingIds.has(inv.id)) {
        await sendJson(`${baseUrl}/api/investments/${inv.id}`, "PUT", {
          type: inv.type,
          institution: inv.institution,
          name: inv.name,
          amount_invested: Number(inv.amount_invested ?? 0),
        });
      } else {
        await sendJson(`${baseUrl}/api/investments`, "POST", {
          id: inv.id,
          type: inv.type,
          institution: inv.institution,
          name: inv.name,
          amount_invested: Number(inv.amount_invested ?? 0),
        });
      }
    }

    for (const ret of monthlyReturns) {
      if (!ret?.investment_id) continue;
      await sendJson(`${baseUrl}/api/returns`, "POST", {
        investment_id: ret.investment_id,
        month: Number(ret.month),
        year: Number(ret.year),
        income_value: Number(ret.income_value ?? 0),
      });
    }

    for (const closure of monthlyClosures) {
      await sendJson(`${baseUrl}/api/monthly-closures`, "POST", {
        year: Number(closure.year),
        month: Number(closure.month),
        is_closed: Boolean(closure.is_closed),
      });
    }

    logRuntime(`Backup importado de ${backupPath}`);
    await dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      message: "Backup importado com sucesso",
      detail: `Arquivo: ${backupPath}`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao importar backup.";
    logRuntime(message);
    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      message: "Falha ao importar backup",
      detail: message,
    });
  }
}

async function openAppDataFolderFromMenu() {
  const openResult = await shell.openPath(app.getPath("userData"));
  if (openResult) {
    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      message: "Não foi possível abrir a pasta de dados do app",
      detail: openResult,
    });
  }
}

function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
  });
  logRuntime(`Abrir no login: ${enabled ? "ativado" : "desativado"}`);
}

function createApplicationMenu() {
  const openAtLogin = app.getLoginItemSettings().openAtLogin;
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
        {
          label: "Diagnóstico",
          click: () => {
            void openDiagnosticsFromMenu();
          },
        },
        {
          label: "Health Check",
          click: () => {
            void runLocalHealthCheckFromMenu();
          },
        },
        {
          label: "Exportar Backup (JSON)",
          click: () => {
            void exportDataBackupFromMenu();
          },
        },
        {
          label: "Importar Backup (JSON)",
          click: () => {
            void importDataBackupFromMenu();
          },
        },
        {
          label: "Abrir Pasta de Dados",
          click: () => {
            void openAppDataFolderFromMenu();
          },
        },
        {
          label: "Abrir no login",
          type: "checkbox",
          checked: openAtLogin,
          click: (menuItem) => {
            setOpenAtLogin(Boolean(menuItem.checked));
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

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: "FinanceFlow",
  });
  const loadingHtml = encodeURIComponent(
    "<!doctype html><html><body style=\"margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0b1220;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;\"><div style=\"text-align:center\"><h2 style=\"margin:0 0 8px 0\">FinanceFlow</h2><p style=\"margin:0;opacity:.75\">Inicializando aplicativo...</p></div></body></html>"
  );
  mainWindow.loadURL(`data:text/html;charset=utf-8,${loadingHtml}`);
  mainWindow.on("closed", () => {
    serverStarted = false;
    currentServerPort = null;
    mainWindow = null;
  });
  return mainWindow;
}

function loadAppIntoWindow(port) {
  const win = createMainWindow();
  win.loadURL(`http://127.0.0.1:${port}`);
}

async function startServerAndWindow() {
  createMainWindow();
  const standalonePath = getStandalonePath();
  if (process.env.ELECTRON_DEV) {
    const preferredPort = Number(process.env.FINANCEFLOW_PORT || DEFAULT_PORT);
    loadAppIntoWindow(preferredPort);
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
  currentServerPort = port;

  const serverPath = path.join(standalonePath, "server.js");
  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  // Keep server-side API calls aligned with dynamic fallback port.
  process.env.NEXT_PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;
  try {
    require(serverPath);
    serverStarted = true;
  } catch (err) {
    const message =
      err instanceof Error
        ? `Server failed to start: ${err.message}`
        : "Server failed to start.";
    console.error(message);
    logRuntime(message);
    dialog.showErrorBox("FinanceFlow", message);
    app.quit();
    return;
  }
  waitForServer(`http://127.0.0.1:${port}`, START_TIMEOUT_MS)
    .then(() => loadAppIntoWindow(port))
    .catch((err) => {
      serverStarted = false;
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
  serverStarted = false;
  currentServerPort = null;
  app.quit();
});

app.on("quit", () => {
  serverStarted = false;
  currentServerPort = null;
});
