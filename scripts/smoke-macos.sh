#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MACOS_DIR="${ROOT_DIR}/macos-app"

echo "==> Smoke macOS: build web"
npm -C "${ROOT_DIR}" run build

echo "==> Smoke macOS: build desktop"
npm -C "${MACOS_DIR}" run pack

APP_PATH="${MACOS_DIR}/dist/mac-arm64/FinanceFlow.app"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "ERRO: app não encontrado em ${APP_PATH}"
  exit 1
fi

echo "Smoke macOS OK"
