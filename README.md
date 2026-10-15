# Antigravity (agy) Web UI & Messaging Gateway

<p align="center">
  <img src="static/assets/antigravity-logo-dark.svg" alt="Google Antigravity Logo" width="380">
</p>

A modern, high-performance Web UI and multi-channel messaging gateway for the **Google Antigravity (`agy`) CLI** autonomous developer agent.

---

## ⚡ 1-Command Quick Installer

Install everything—including the **Google Antigravity (`agy`) CLI**, Python dependencies, systemd daemon, and CLI launcher—with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/adynetro/agy-web/main/install.sh | bash
```

> **Note:** The installer automatically detects if `agy` is installed; if not found, it downloads and installs `agy` via official channels, creates an isolated virtual environment, configures systemd, and registers the global `agy-webui` command.

---

## 🌟 Key Features

1. **Modern Developer Web Interface**
   - Clean dark obsidian & slate UI with Google Antigravity design styling.
   - Real-time token streaming via bidirectional WebSockets.
   - Collapsible **Live Action & Tool Execution Cards** with command telemetry and terminal output.
   - Full Markdown rendering with syntax highlighting and 1-click **Copy Code** buttons.
   - Multi-turn conversation management with automatic persistence in SQLite and transcript logs.
   - Dynamic model selector (`gemini-3.8-flash-high`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`).
   - Reasoning effort selector (`low`, `medium`, `high`, `max`) and execution mode selector (`auto`, `plan`, `accept-edits`).
   - Workspace directory selector (CWD).
   - Abort / Stop generation button.
   - Live hardware telemetry (CPU, RAM, Disk) & token quota monitors.

2. **Extensible Messaging Architecture**
   - Modular **Channel Adapter** pattern (`BaseChannel`).
   - **Web UI Channel**: High-performance WebSocket manager.
   - **Discord Channel**: Full multi-turn Discord Bot integration with auto-threading and intelligent message chunking.
   - **Webhook Channel**: Programmatic HTTP trigger and callback interface.
   - Pluggable design: Add Telegram, Slack, Matrix, or custom webhooks in ~50 lines of Python.

3. **Antigravity Process Manager & Attachment**
   - Live discovery of all active `agy` CLI processes running across the host.
   - Inspect memory RSS, uptime, CWD, flags, and arguments in real time.
   - Stream live process telemetry, logs, and transcript steps.
   - 1-click session attachment (switch active chat directly into the running CLI session).
   - Graceful termination (`SIGINT`) or force kill (`SIGKILL`) directly from the UI.

4. **Real-Time `/btw` Model Steering**
   - Inject course corrections, hints, or advice mid-turn while the agent is executing.
   - Seamlessly steer by typing `/btw <hint>` into the chat bar while the model is thinking.
   - Dedicated "⚡ Steer (/btw)" button on live banner, chat toolbar, and process manager.
   - Optional tool interruption (`SIGINT`) to unstick frozen commands while immediately applying guidance.

5. **Production Daemon & CLI Launcher**
   - Native `systemd` service (`agy-webui.service`) that auto-starts on boot.
   - Global command-line launcher: `agy-webui [--port 8000] [--host 0.0.0.0]`.
   - Complete Docker & `docker-compose` support for containerized environments.

---

## 🚀 Installation Options

### Option A: Automated Installer (Recommended)

From a terminal on your host or container:

```bash
# Clone the repository
git clone https://github.com/adynetro/agy-web.git
cd agy-webui

# Run the installer
./install.sh
```

**Installer Options:**
- `--skip-agy`: Skip checking or installing the `agy` CLI binary.
- `--port <port>`: Specify custom port (default: `8000`).
- `--host <ip>`: Specify bind host (default: `0.0.0.0`).
- `--no-service`: Skip systemd service registration.
- `-y` or `--yes`: Non-interactive mode using defaults.

### Option B: Python Package (`pip`)

You can install `agy-webui` as a standard Python package:

```bash
git clone https://github.com/adynetro/agy-web.git
cd agy-webui
pip install -e .

# Launch using the installed entry point:
agy-webui --port 8000
```

### Option C: Docker / Podman

Run in an isolated container with `docker-compose`:

```bash
git clone https://github.com/adynetro/agy-web.git
cd agy-webui
docker compose up -d
```

The Web UI will be immediately accessible on `http://localhost:8000`.

---

## 🛠️ Service Management

When installed as a `systemd` service:

```bash
# Check status
systemctl status agy-webui

# View live log output
journalctl -u agy-webui -f

# Restart daemon
systemctl restart agy-webui

# Stop daemon
systemctl stop agy-webui
```

---

## 🤖 Discord Bot Integration Setup

The Discord Channel allows you and your team to interact with Antigravity directly from Discord servers or direct messages.

### Step 1: Create a Discord Bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name (e.g., `Antigravity`).
3. In the left sidebar, navigate to **Bot**.
4. Click **Reset Token** and copy your **Bot Token**.
5. Scroll down to **Privileged Gateway Intents** and enable:
   - ✅ **Message Content Intent** (Required for the bot to read prompts).
6. Save Changes.

### Step 2: Invite the Bot to Your Server
1. In the Discord Developer Portal, navigate to **OAuth2 > URL Generator**.
2. Under **Scopes**, select `bot`.
3. Under **Bot Permissions**, select:
   - `Send Messages`
   - `Read Message History`
   - `Create Public Threads` / `Send Messages in Threads`
4. Copy the generated URL and open it in your browser to invite the bot.

### Step 3: Configure via the Web UI
1. Open the Web UI (`http://<server-ip>:8000`).
2. Click the **Discord** pill in the sidebar (or click **Channels**).
3. Toggle **Enable Discord Bot** to **ON**.
4. Paste your **Discord Bot Token**.
5. (Optional) Customize the command prefix (default: `!agy`) or restrict to specific channels.
6. Click **Save & Restart Bot**.

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/conversations` | `GET` | List recent conversation summaries |
| `/api/conversations/{id}` | `GET` | Get full message history and transcript |
| `/api/conversations/{id}` | `DELETE` | Delete a conversation |
| `/api/models` | `GET` | List available models from `agy` |
| `/api/chat` | `POST` | Execute a prompt turn (HTTP JSON) |
| `/api/abort/{id}` | `POST` | Abort an ongoing generation |
| `/api/channels` | `GET` | List all channels and their live status |
| `/api/channels/discord/config`| `POST` | Update Discord configuration & restart bot |
| `/api/channels/webhook/trigger`| `POST` | Trigger agent prompt via webhook |
| `/api/settings` | `GET` / `POST` | View and update agent defaults |
| `/api/system` | `GET` | Get host CPU, memory, and disk utilization |
| `/ws/chat/{id}` | `WebSocket` | Real-time bidirectional token streaming |

---

## 📁 Repository Structure

```
agy-webui/
├── app/
│   ├── config.py           # Portable configuration & agy auto-detection
│   ├── engine.py           # Async subprocess runner for agy CLI streaming
│   ├── conversations.py    # Conversation storage & transcript parser
│   ├── channels/           # Extensible channel adapters (Web, Discord, Webhook)
│   ├── api/                # FastAPI REST & WebSocket routers
│   └── main.py             # FastAPI entrypoint & CLI entrypoint
├── static/
│   ├── index.html          # Web UI single-page application
│   ├── css/app.css         # Dark obsidian styling
│   ├── js/app.js           # Client-side streaming & telemetry manager
│   ├── assets/             # Vector icons and brand marks
│   └── vendor/             # Bundled Markdown & code highlight libraries
├── config/
│   └── settings.example.json # Example configuration template
├── scripts/
│   └── start.sh            # Local startup script
├── install.sh              # 1-command installer script
├── uninstall.sh            # Clean uninstaller script
├── pyproject.toml          # Python package definition
├── Dockerfile              # Container image build file
├── docker-compose.yml      # Docker compose recipe
├── requirements.txt        # Python package dependencies
├── LICENSE                 # Apache 2.0 License
└── README.md
```

---

## 📄 License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
