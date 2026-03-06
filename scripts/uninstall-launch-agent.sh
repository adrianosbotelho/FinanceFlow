#!/usr/bin/env bash
# Remove o Launch Agent do FinanceFlow (para de iniciar automaticamente no login).

PLIST_ID="com.financeflow.dev"
PLIST_NAME="$PLIST_ID.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENTS_DIR/$PLIST_NAME"

launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"
echo "Launch Agent removido. O FinanceFlow não será mais iniciado automaticamente no login."
