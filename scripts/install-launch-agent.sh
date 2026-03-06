#!/usr/bin/env bash
# Instala um Launch Agent no macOS para iniciar o FinanceFlow (npm run dev)
# automaticamente no login. Logs em ~/Library/Logs/FinanceFlow-dev.log

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START_SCRIPT="$PROJECT_ROOT/scripts/start-dev.sh"
PLIST_ID="com.financeflow.dev"
PLIST_NAME="$PLIST_ID.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENTS_DIR/$PLIST_NAME"
LOG_PATH="$HOME/Library/Logs/FinanceFlow-dev.log"

# Garante que o script de start é executável
chmod +x "$START_SCRIPT"

mkdir -p "$AGENTS_DIR"

# Cria o plist (escapar o path e o script para XML)
PLIST_CONTENT=$(cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_ID</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>$START_SCRIPT</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_PATH</string>
  <key>StandardErrorPath</key>
  <string>$LOG_PATH</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF
)

echo "$PLIST_CONTENT" > "$PLIST_PATH"
echo "Launch Agent instalado em: $PLIST_PATH"

# Para carregar agora (opcional)
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "Pronto. O FinanceFlow será iniciado automaticamente no próximo login."
echo "Logs: $LOG_PATH"
echo ""
echo "Para parar agora: launchctl unload $PLIST_PATH"
echo "Para desinstalar: bash $PROJECT_ROOT/scripts/uninstall-launch-agent.sh"
