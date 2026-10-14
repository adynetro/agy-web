#!/usr/bin/env bash
#
# Antigravity (agy) Web UI - Uninstaller Script
#
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[38;5;82m'
RED='\033[38;5;196m'
YELLOW='\033[38;5;220m'
NC='\033[0m'

SERVICE_NAME="agy-webui.service"

echo -e "${YELLOW}${BOLD}Uninstalling Antigravity Web UI...${NC}"

# 1. Stop and disable systemd service
if command -v systemctl >/dev/null 2>&1; then
  echo "Stopping and disabling systemd service..."
  if [ "$(id -u)" -eq 0 ]; then
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/$SERVICE_NAME"
    systemctl daemon-reload
  elif command -v sudo >/dev/null 2>&1; then
    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    sudo rm -f "/etc/systemd/system/$SERVICE_NAME"
    sudo systemctl daemon-reload
  fi
  
  if [ -f "$HOME/.config/systemd/user/$SERVICE_NAME" ]; then
    systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/$SERVICE_NAME"
    systemctl --user daemon-reload
  fi
fi

# 2. Remove CLI launcher
echo "Removing CLI launcher..."
rm -f /usr/local/bin/agy-webui "$HOME/.local/bin/agy-webui" 2>/dev/null || true

# 3. Clean up virtualenv
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/.venv" ]; then
  echo "Removing virtual environment ($SCRIPT_DIR/.venv)..."
  rm -rf "$SCRIPT_DIR/.venv"
fi

echo -e "${GREEN}${BOLD}[✓] Antigravity Web UI uninstalled.${NC}"
echo "Source files in $SCRIPT_DIR were kept. To remove entirely, run: rm -rf $SCRIPT_DIR"
