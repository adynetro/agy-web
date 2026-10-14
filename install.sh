#!/usr/bin/env bash
#
# Antigravity (agy) Web UI & Messaging Gateway - One-Command Installer
# Works on Debian/Ubuntu, Fedora/RHEL, Arch Linux, Alpine, and macOS.
#
set -euo pipefail

# --- ANSI Colors ---
BOLD='\033[1m'
BLUE='\033[38;5;75m'
CYAN='\033[38;5;44m'
GREEN='\033[38;5;82m'
YELLOW='\033[38;5;220m'
RED='\033[38;5;196m'
MUTED='\033[38;5;244m'
NC='\033[0m' # No Color

# --- Configuration Defaults ---
DEFAULT_PORT="8000"
DEFAULT_HOST="0.0.0.0"
REPO_URL="https://github.com/adynetro/agy-web.git" # Override with AGY_WEBUI_REPO if needed
INSTALL_DIR=""
SKIP_AGY=false
NO_SERVICE=false
NON_INTERACTIVE=false
SERVICE_USER=""
SERVICE_GROUP=""

print_banner() {
  cat << "EOF"
    ___             __    __      __  __  ______
   /   | ____ _____/ /   / /     / / / / /  _/ /
  / /| |/ __ `/ __  /   / /     / / / /  / / / / 
 / ___ / /_/ / /_/ /   / /___  / /_/ / _/ / / /  
/_/  |_\__, /\__,_/   /_____/  \____/ /___/ /_/   
      /____/   Web UI & Autonomous Agent Gateway
EOF
  echo -e "${MUTED}======================================================${NC}"
  echo -e "${CYAN} Google Antigravity (agy) Web Interface Installer${NC}"
  echo -e "${MUTED}======================================================${NC}\n"
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

show_help() {
  echo "Usage: install.sh [options]"
  echo ""
  echo "Options:"
  echo "  -d, --dir <path>       Target installation directory (default: current dir or /opt/agy-webui)"
  echo "  -p, --port <port>      Web UI HTTP port (default: 8000)"
  echo "  --host <host>          Bind host IP (default: 0.0.0.0)"
  echo "  --skip-agy             Do not install or verify Google Antigravity (agy) CLI"
  echo "  --no-service           Do not install or enable the systemd daemon service"
  echo "  -y, --yes              Non-interactive mode (use defaults without prompting)"
  echo "  -h, --help             Show this help message and exit"
  echo ""
}

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    -p|--port)
      DEFAULT_PORT="$2"
      shift 2
      ;;
    --host)
      DEFAULT_HOST="$2"
      shift 2
      ;;
    --skip-agy)
      SKIP_AGY=true
      shift
      ;;
    --no-service)
      NO_SERVICE=true
      shift
      ;;
    -y|--yes)
      NON_INTERACTIVE=true
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      log_warn "Unknown option: $1"
      shift
      ;;
  esac
done

print_banner

# --- 1. Determine Execution Mode & Installation Directory ---
SCRIPT_SOURCE="${BASH_SOURCE[0]:-}"

if [ -n "$SCRIPT_SOURCE" ] && [ -f "$SCRIPT_SOURCE" ]; then
  DETECTED_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  if [ -f "$DETECTED_DIR/app/main.py" ]; then
    INSTALL_DIR="${INSTALL_DIR:-$DETECTED_DIR}"
  fi
fi

if [ -z "$INSTALL_DIR" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    INSTALL_DIR="/opt/agy-webui"
  else
    INSTALL_DIR="$HOME/.local/share/agy-webui"
  fi
fi

log_info "Target installation directory: ${BOLD}${INSTALL_DIR}${NC}"

# --- 2. Check & Install System Packages ---
log_info "Verifying system prerequisites..."

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  elif command -v pacman >/dev/null 2>&1; then
    echo "pacman"
  elif command -v apk >/dev/null 2>&1; then
    echo "apk"
  elif command -v brew >/dev/null 2>&1; then
    echo "brew"
  else
    echo "unknown"
  fi
}

PKG_MGR="$(detect_package_manager)"

install_system_pkgs() {
  case "$PKG_MGR" in
    apt)
      log_info "Installing required packages via apt (python3, python3-pip, python3-venv, git, curl)..."
      if [ "$(id -u)" -eq 0 ]; then
        apt-get update -y && apt-get install -y python3 python3-pip python3-venv git curl
      elif command -v sudo >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y python3 python3-pip python3-venv git curl
      fi
      ;;
    dnf|yum)
      log_info "Installing required packages via $PKG_MGR..."
      CMD="dnf"
      [ "$PKG_MGR" = "yum" ] && CMD="yum"
      if [ "$(id -u)" -eq 0 ]; then
        $CMD install -y python3 python3-pip git curl
      elif command -v sudo >/dev/null 2>&1; then
        sudo $CMD install -y python3 python3-pip git curl
      fi
      ;;
    pacman)
      log_info "Installing required packages via pacman..."
      if [ "$(id -u)" -eq 0 ]; then
        pacman -Sy --noconfirm python python-pip git curl
      elif command -v sudo >/dev/null 2>&1; then
        sudo pacman -Sy --noconfirm python python-pip git curl
      fi
      ;;
    apk)
      log_info "Installing required packages via apk..."
      apk add --no-cache python3 py3-pip git curl
      ;;
  esac
}

# Check Python 3
if ! command -v python3 >/dev/null 2>&1; then
  log_warn "Python 3 is not installed."
  install_system_pkgs
fi

if ! command -v python3 >/dev/null 2>&1; then
  log_error "Python 3 is required but could not be installed. Please install Python 3.9+ manually."
  exit 1
fi

PYTHON_VER="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
log_success "Python version ${PYTHON_VER} detected."

# Verify venv support
if ! python3 -m venv --help >/dev/null 2>&1; then
  log_warn "Python virtualenv module (venv) not found. Attempting to install..."
  install_system_pkgs
fi

# Ensure curl and git
if ! command -v curl >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  install_system_pkgs
fi

# --- 3. Google Antigravity (agy) CLI Installation ---
if [ "$SKIP_AGY" = false ]; then
  log_info "Checking Google Antigravity (agy) CLI installation..."
  
  HAS_AGY=false
  AGY_PATH=""

  if command -v agy >/dev/null 2>&1; then
    AGY_PATH="$(command -v agy)"
    HAS_AGY=true
  elif [ -x "$HOME/.local/bin/agy" ]; then
    AGY_PATH="$HOME/.local/bin/agy"
    HAS_AGY=true
  elif [ -x "/usr/local/bin/agy" ]; then
    AGY_PATH="/usr/local/bin/agy"
    HAS_AGY=true
  fi

  if [ "$HAS_AGY" = true ]; then
    log_success "Google Antigravity CLI detected: ${BOLD}${AGY_PATH}${NC}"
  else
    log_info "Google Antigravity CLI not found. Downloading and installing..."
    echo -e "${CYAN}Running official installer: curl -fsSL https://antigravity.google/cli/install.sh | bash${NC}"
    
    if curl -fsSL https://antigravity.google/cli/install.sh | bash; then
      log_success "Google Antigravity CLI installed successfully."
      AGY_PATH="$HOME/.local/bin/agy"
    else
      log_error "Automatic installation of agy CLI failed. You can install it manually from https://antigravity.google"
    fi

    # Ensure ~/.local/bin is in PATH for current and future shell sessions
    export PATH="$HOME/.local/bin:$PATH"
    for shell_rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
      if [ -f "$shell_rc" ]; then
        if ! grep -q '\.local/bin' "$shell_rc"; then
          echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$shell_rc"
          log_info "Added ~/.local/bin to PATH in $shell_rc"
        fi
      fi
    done
  fi
fi

# --- 4. Setup Source Code Directory ---
mkdir -p "$INSTALL_DIR"

if [ ! -f "$INSTALL_DIR/app/main.py" ]; then
  # Running from remote curl pipe without local files
  log_info "Fetching latest Antigravity Web UI source from repository..."
  ACTUAL_REPO="${AGY_WEBUI_REPO:-$REPO_URL}"
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull --ff-only || true
  else
    git clone "$ACTUAL_REPO" "$INSTALL_DIR"
  fi
fi

cd "$INSTALL_DIR"

# --- 5. Virtual Environment & Dependencies ---
VENV_DIR="$INSTALL_DIR/.venv"
log_info "Configuring Python virtual environment in ${VENV_DIR}..."

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

VENV_PIP="$VENV_DIR/bin/pip"
VENV_PYTHON="$VENV_DIR/bin/python3"

log_info "Installing Python dependencies..."
"$VENV_PIP" install --upgrade pip --quiet
"$VENV_PIP" install -r "$INSTALL_DIR/requirements.txt" --quiet

log_success "Python environment and dependencies successfully configured."

# --- 6. Configuration Setup ---
SETTINGS_FILE="$INSTALL_DIR/config/settings.json"
mkdir -p "$INSTALL_DIR/config"

if [ ! -f "$SETTINGS_FILE" ]; then
  log_info "Creating default configuration in config/settings.json..."
  
  DETECTED_AGY_BIN="$(command -v agy || echo "$HOME/.local/bin/agy")"
  DETECTED_CWD="$HOME"

  cat > "$SETTINGS_FILE" << EOF
{
  "host": "${DEFAULT_HOST}",
  "port": ${DEFAULT_PORT},
  "agy_bin": "${DETECTED_AGY_BIN}",
  "default_model": "gemini-3.8-flash-high",
  "default_effort": "high",
  "default_mode": "auto",
  "default_cwd": "${DETECTED_CWD}",
  "dangerously_skip_permissions": true,
  "discord_enabled": false,
  "discord_bot_token": "",
  "discord_prefix": "!agy",
  "discord_allowed_channels": [],
  "discord_allowed_guilds": [],
  "discord_auto_thread": false,
  "discord_show_tools": true
}
EOF
  log_success "Created config/settings.json with auto-detected settings."
fi

# Ensure start.sh is executable
chmod +x "$INSTALL_DIR/scripts/start.sh"

# --- 7. CLI Launcher Command ---
BIN_TARGET="/usr/local/bin/agy-webui"
USE_SUDO=false

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    USE_SUDO=true
  else
    BIN_TARGET="$HOME/.local/bin/agy-webui"
    mkdir -p "$HOME/.local/bin"
  fi
fi

log_info "Creating executable CLI launcher at ${BIN_TARGET}..."

cat > /tmp/agy-webui-launcher << EOF
#!/usr/bin/env bash
PROJECT_DIR="${INSTALL_DIR}"
exec "\$PROJECT_DIR/.venv/bin/python3" -m uvicorn app.main:app --app-dir "\$PROJECT_DIR" --host "\${HOST:-${DEFAULT_HOST}}" --port "\${PORT:-${DEFAULT_PORT}}" "\$@"
EOF
chmod +x /tmp/agy-webui-launcher

if [ "$(id -u)" -eq 0 ]; then
  mv /tmp/agy-webui-launcher "$BIN_TARGET"
elif [ "$USE_SUDO" = true ]; then
  sudo mv /tmp/agy-webui-launcher "$BIN_TARGET"
else
  mv /tmp/agy-webui-launcher "$BIN_TARGET"
fi

log_success "Launcher installed: run ${BOLD}agy-webui${NC} from any terminal."

# --- 8. Systemd Service Setup ---
CURRENT_USER="$(id -un)"
CURRENT_GROUP="$(id -gn)"
SERVICE_NAME="agy-webui.service"

if [ "$NO_SERVICE" = false ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  log_info "Configuring systemd service (${SERVICE_NAME})..."
  
  SERVICE_FILE_CONTENT="[Unit]
Description=Antigravity (agy) Web UI & Messaging Gateway
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
Group=${CURRENT_GROUP}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/.venv/bin/python3 -m uvicorn app.main:app --host ${DEFAULT_HOST} --port ${DEFAULT_PORT}
Restart=always
RestartSec=3
Environment=PATH=${HOME}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=${HOME}
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
"

  SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
  
  if [ "$(id -u)" -eq 0 ]; then
    echo "$SERVICE_FILE_CONTENT" > "$SERVICE_PATH"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    systemctl restart "$SERVICE_NAME"
    log_success "Systemd service enabled and started (${SERVICE_NAME})."
  elif command -v sudo >/dev/null 2>&1; then
    echo "$SERVICE_FILE_CONTENT" | sudo tee "$SERVICE_PATH" > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    sudo systemctl restart "$SERVICE_NAME"
    log_success "Systemd service enabled and started via sudo."
  else
    # User-level systemd service
    USER_SERVICE_DIR="$HOME/.config/systemd/user"
    mkdir -p "$USER_SERVICE_DIR"
    USER_SERVICE_PATH="$USER_SERVICE_DIR/${SERVICE_NAME}"
    echo "$SERVICE_FILE_CONTENT" | grep -v -E "^(User|Group)=" > "$USER_SERVICE_PATH"
    systemctl --user daemon-reload
    systemctl --user enable "$SERVICE_NAME"
    systemctl --user restart "$SERVICE_NAME"
    log_success "User-level systemd service enabled and started."
  fi
fi

# --- 9. Summary & Access Info ---
DETECTED_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}${BOLD} Installation Complete!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Web Interface URL:    ${CYAN}${BOLD}http://${DETECTED_IP}:${DEFAULT_PORT}${NC}"
echo -e "Local URL:            ${CYAN}http://localhost:${DEFAULT_PORT}${NC}"
echo -e "Installation Dir:     ${MUTED}${INSTALL_DIR}${NC}"
echo -e "Launcher Command:     ${BOLD}agy-webui${NC}"

if command -v systemctl >/dev/null 2>&1 && [ "$NO_SERVICE" = false ]; then
  echo -e "\n${BOLD}Service Management:${NC}"
  echo -e "  Status:             systemctl status ${SERVICE_NAME}"
  echo -e "  View Logs:          journalctl -u ${SERVICE_NAME} -f"
  echo -e "  Restart:            systemctl restart ${SERVICE_NAME}"
  echo -e "  Stop:               systemctl stop ${SERVICE_NAME}"
fi

echo -e "\n${BOLD}Manual Launch:${NC}"
echo -e "  ${INSTALL_DIR}/scripts/start.sh"
echo -e "  or: ${BOLD}agy-webui --port 8000${NC}\n"
EOF
