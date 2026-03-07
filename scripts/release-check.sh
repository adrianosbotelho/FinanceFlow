#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Release check: lint"
npm -C "${ROOT_DIR}" run lint

echo "==> Release check: web build"
npm -C "${ROOT_DIR}" run build

echo "==> Release check: macOS smoke"
npm -C "${ROOT_DIR}" run smoke:macos

echo
echo "Release check OK"
echo "- Lint: aprovado"
echo "- Build web: aprovado"
echo "- Smoke macOS (.app): aprovado"
