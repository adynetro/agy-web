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
   - **Telegram Channel**: Native Telegram Bot integration via real-time HTTPS long polling (zero port-forwarding), interactive commands (`/new`, `/status`, `/btw`), and tool progress streaming.
   - **WhatsApp Channel**: Dual-mode WhatsApp bridge supporting official **Meta WhatsApp Cloud API** and self-hosted bridges (**Evolution API**, **Baileys**, **WPPConnect**).
   - **iMessage Channel**: Native Apple iMessage integration via **BlueBubbles Server** REST API and inbound webhooks.
   - **Webhook Channel**: Programmatic HTTP trigger and callback interface for CI/CD and automation workflows.

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
2. Click the **Channels** pill in the sidebar footer (or open **Settings & Integrations > Channels**).
3. Select **Discord** and toggle **Enable Discord Bot** to **ON**.
4. Paste your **Discord Bot Token**.
5. (Optional) Customize the command prefix (default: `!agy`) or restrict to specific channel IDs.
6. Click **Save & Restart Discord Bot**.

---

## ✈️ Telegram Bot Integration Setup

1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, name your bot, and choose a unique username ending in `bot`.
3. Copy the HTTP API token provided by BotFather.
4. Open the Web UI > **Settings & Integrations > Channels > Telegram**.
5. Toggle **Enable Telegram Bot** to **ON**, paste your bot token, and optionally specify allowed Telegram usernames/IDs.
6. Click **Save & Restart Telegram Bot**. The bot will immediately connect using real-time HTTPS long polling (no port forwarding or reverse proxy needed).

---

## 💬 WhatsApp Integration Setup

Antigravity supports two integration architectures for WhatsApp:

### Mode 1: Meta WhatsApp Cloud API (Official)
1. In the [Meta for Developers](https://developers.facebook.com/) portal, configure a WhatsApp Business app.
2. Obtain your **Phone Number ID** and a **System User Permanent Access Token** with `whatsapp_business_messaging` permissions.
3. In Web UI > **Channels > WhatsApp**, set Mode to `Meta WhatsApp Cloud API (Official)`, enter your Phone Number ID and Access Token.
4. In Meta Webhook settings, point your callback URL to `https://<your-host>/api/channels/whatsapp/webhook` and enter your verify token (default: `agy-verify-secret`).

### Mode 2: Local Gateway / Webhook Bridge (Evolution API, Baileys, WPPConnect)
1. Run your local WhatsApp bridge container (e.g. Evolution API, Baileys HTTP gateway).
2. In Web UI > **Channels > WhatsApp**, set Mode to `Local Gateway / Webhook Bridge`.
3. Enter your gateway outbound API URL (e.g. `http://10.0.0.192:8080/message/sendText`) and API key.
4. In your bridge container webhook configuration, set inbound webhook to `https://<your-host>/api/channels/whatsapp/webhook`.

---

## 🍎 Apple iMessage Integration Setup

1. Run [BlueBubbles Server](https://bluebubbles.app/) on a macOS host or VM in your homelab.
2. In BlueBubbles Server Settings > **API & Webhooks**:
   - Note your server URL (e.g. `http://10.0.0.95:1234` or public HTTPS URL) and password.
   - Add a webhook pointing to `https://<your-host>/api/channels/imessage/webhook` for event `new-message`.
3. In Web UI > **Channels > iMessage**, toggle **Enable Apple iMessage Integration**, enter your BlueBubbles URL and password.
4. Click **Save iMessage Settings**. You can now text Antigravity directly from iMessage!

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
| `/api/channels/telegram/config`| `POST` | Update Telegram configuration & restart bot |
| `/api/channels/telegram/webhook`| `POST` | Inbound Telegram webhook endpoint (optional) |
| `/api/channels/whatsapp/config`| `POST` | Update WhatsApp configuration |
| `/api/channels/whatsapp/webhook`| `GET` / `POST` | Meta webhook verification & message receiver |
| `/api/channels/imessage/config`| `POST` | Update iMessage configuration |
| `/api/channels/imessage/webhook`| `POST` | BlueBubbles / iMessage webhook message receiver |
| `/api/channels/webhook/trigger`| `POST` | Trigger agent prompt via webhook |
| `/api/settings` | `GET` / `POST` | View and update agent defaults |
| `/api/system` | `GET` | Get host CPU, memory, and disk utilization |
| `/ws/chat/{id}` | `WebSocket` | Real-time bidirectional token streaming |

---

## 📁 Repository Structure

```
agy-webui/
├── app/
│   ├── config.py           # Portable configuration & token masking
│   ├── engine.py           # Async subprocess runner for agy CLI streaming
│   ├── conversations.py    # Conversation storage & transcript parser
│   ├── channels/           # Extensible channel adapters (Web, Discord, Telegram, WhatsApp, iMessage, Webhook)
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

## 🎨 Custom Branding & Visual Identity

Antigravity Web UI supports real-time custom branding without recompilation or page reloads:

- **Branding Settings Tab**: Open **Settings & Integrations > 🎨 Branding** in the web interface.
- **Configurable Identity**:
  - **Brand Prefix & Name**: Customize the header identity (e.g. `Google` + `Antigravity` or `Homelab` + `Orchestrator`).
  - **Header Badge**: Customize runtime tag pill (e.g. `AGY 2.0`, `LAB`, `ENTERPRISE`).
  - **Window Title & Favicon**: Set custom browser tab titles and favicon links.
  - **Hero Headline & Tagline**: Personalize the welcome banner and prompt suggestions.
  - **Accent Color Palette**: Interactive color picker with 6 curated palette presets (Electric Blue, Emerald Green, Neon Violet, Cyberpunk Amber, Ruby Coral, Electric Cyan) which dynamically re-skin CSS variables across the entire application.
  - **Custom Logo Upload**: Upload an SVG or PNG image directly via the UI or supply a custom image URL.
- **REST API Endpoints**:
  - `GET /api/branding`: Fetch current branding parameters.
  - `POST /api/branding`: Update branding fields in real time.
  - `POST /api/branding/logo`: Upload and set custom emblem/logo file.

---

## 📄 License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
