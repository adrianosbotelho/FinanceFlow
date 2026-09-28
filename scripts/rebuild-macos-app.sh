#!/usr/bin/env bash
# Recompila o app macOS: fecha o FinanceFlow.app se estiver aberto, gera o standalone, empacota
# com o electron-builder e abre o app novamente.
#
# Uso: npm run app:rebuild            (fecha, compila e reabre)
#      npm run app:rebuild -- --no-open  (fecha e compila, sem reabrir)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="FinanceFlow"
APP_PATH="$ROOT_DIR/macos-app/dist/mac-arm64/$APP_NAME.app"
APP_BINARY="$APP_PATH/Contents/MacOS/$APP_NAME"
APP_BUNDLE_ID="com.financeflow.app" # appId em macos-app/electron-builder.json
QUIT_TIMEOUT_SECONDS=15
LAUNCH_TIMEOUT_SECONDS=20
OPEN_AFTER_BUILD=1

for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN_AFTER_BUILD=0 ;;
    *) echo "Opção desconhecida: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[app:rebuild] %s\n' "$*"; }

app_pids() {
  # Só o processo principal do app deste repositório (os helpers do Electron saem junto).
  # O nome do processo é só "FinanceFlow"; o executável (lsof, tipo txt) confirma o caminho.
  local pid exe
  for pid in $(pgrep -x "$APP_NAME" || true); do
    exe="$(lsof -a -p "$pid" -d txt -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    [ "$exe" = "$APP_BINARY" ] && echo "$pid"
  done
  return 0
}

quit_app() {
  if [ -z "$(app_pids)" ]; then
    log "App não está aberto."
    return
  fi
  log "Fechando o $APP_NAME..."
  osascript -e "tell application id \"$APP_BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 "$QUIT_TIMEOUT_SECONDS"); do
    [ -z "$(app_pids)" ] && { log "App fechado."; return; }
    sleep 1
  done
  log "App não fechou em ${QUIT_TIMEOUT_SECONDS}s; encerrando o processo."
  app_pids | xargs kill -TERM 2>/dev/null || true
  sleep 3
  if [ -n "$(app_pids)" ]; then
    app_pids | xargs kill -KILL 2>/dev/null || true
    sleep 1
  fi
  [ -z "$(app_pids)" ] || { log "Não foi possível fechar o app." >&2; exit 1; }
  log "App encerrado."
}

build_app() {
  log "Gerando o standalone (next build + estáticos)..."
  node "$ROOT_DIR/macos-app/build-standalone.js"
  log "Empacotando com o electron-builder..."
  (cd "$ROOT_DIR/macos-app" && npx electron-builder --mac)
  [ -x "$APP_BINARY" ] || { log "Build terminou sem gerar $APP_PATH." >&2; exit 1; }
  log "Build concluído: $APP_PATH"
}

open_app() {
  log "Abrindo o $APP_NAME..."
  open "$APP_PATH"
  for _ in $(seq 1 "$LAUNCH_TIMEOUT_SECONDS"); do
    if [ -n "$(app_pids)" ]; then
      log "App aberto (pid $(app_pids | head -1))."
      return
    fi
    sleep 1
  done
  log "O app não apareceu em ${LAUNCH_TIMEOUT_SECONDS}s; verifique manualmente." >&2
  exit 1
}

quit_app
build_app
if [ "$OPEN_AFTER_BUILD" -eq 1 ]; then
  open_app
else
  log "Reabertura desativada (--no-open)."
fi
