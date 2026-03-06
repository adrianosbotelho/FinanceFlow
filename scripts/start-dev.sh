#!/usr/bin/env bash
# Inicia o servidor de desenvolvimento do FinanceFlow.
# Usado manualmente ou pelo LaunchAgent no macOS.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Garante Node/npm no PATH (nvm, Homebrew ou sistema)
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi

# Carrega variáveis de ambiente
if [ -f "$PROJECT_ROOT/.env.local" ]; then
  set -a
  source "$PROJECT_ROOT/.env.local"
  set +a
fi

exec npm run dev
