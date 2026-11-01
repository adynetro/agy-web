from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Any, Dict, List
from pydantic import BaseModel, Field

import shutil

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
SETTINGS_PATH = CONFIG_DIR / "settings.json"


def find_agy_bin() -> str:
    """Auto-detect the agy binary path across common install locations."""
    which_agy = shutil.which("agy")
    if which_agy:
        return which_agy
    local_agy = Path.home() / ".local/bin/agy"
    if local_agy.exists():
        return str(local_agy)
    usr_local = Path("/usr/local/bin/agy")
    if usr_local.exists():
        return str(usr_local)
    return "agy"


class Settings(BaseModel):
    host: str = Field(default="0.0.0.0", description="Server host to bind")
    port: int = Field(default=8000, description="Server port")
    agy_bin: str = Field(default_factory=find_agy_bin, description="Path to agy binary")
    default_model: str = Field(default="gemini-3.8-flash-high", description="Default model ID")
    default_effort: str = Field(default="high", description="Default reasoning effort (low, medium, high, max)")
    default_mode: str = Field(default="auto", description="Default execution mode (auto, plan, accept-edits)")
    default_cwd: str = Field(default_factory=lambda: str(Path.home()), description="Default working directory for tasks")
    dangerously_skip_permissions: bool = Field(default=True, description="Auto-approve tools without prompt")

    # Discord Channel Settings
    discord_enabled: bool = Field(default=False, description="Whether the Discord bot channel is active")
    discord_bot_token: str = Field(default="", description="Discord Bot Token from Developer Portal")
    discord_prefix: str = Field(default="!agy", description="Command prefix for bot commands")
    discord_allowed_channels: List[str] = Field(default_factory=list, description="Allowed channel IDs (empty for all)")
    discord_allowed_guilds: List[str] = Field(default_factory=list, description="Allowed guild/server IDs (empty for all)")
    discord_auto_thread: bool = Field(default=False, description="Automatically spawn threads for channel questions")
    discord_show_tools: bool = Field(default=True, description="Post tool execution notifications in Discord")

    # Telegram Channel Settings
    telegram_enabled: bool = Field(default=False, description="Whether the Telegram bot channel is active")
    telegram_bot_token: str = Field(default="", description="Telegram Bot Token from @BotFather")
    telegram_allowed_users: List[str] = Field(default_factory=list, description="Allowed Telegram usernames or user IDs (empty for all)")
    telegram_show_tools: bool = Field(default=True, description="Send tool execution updates in Telegram")

    # WhatsApp Channel Settings
    whatsapp_enabled: bool = Field(default=False, description="Whether the WhatsApp messaging channel is active")
    whatsapp_mode: str = Field(default="cloud_api", description="Integration mode: 'cloud_api' (Meta Graph API) or 'gateway' (Evolution/Baileys/custom)")
    whatsapp_phone_number_id: str = Field(default="", description="Meta WhatsApp Phone Number ID")
    whatsapp_access_token: str = Field(default="", description="Meta WhatsApp Permanent Access Token")
    whatsapp_verify_token: str = Field(default="agy-verify-secret", description="Meta Webhook Verification Token")
    whatsapp_gateway_url: str = Field(default="", description="Self-hosted WhatsApp Gateway endpoint URL (e.g. Evolution/Baileys/WPPConnect)")
    whatsapp_gateway_token: str = Field(default="", description="Authentication token/API key for gateway endpoint")
    whatsapp_allowed_numbers: List[str] = Field(default_factory=list, description="Allowed sender phone numbers (empty for all)")
    whatsapp_show_tools: bool = Field(default=False, description="Send tool execution updates in WhatsApp")

    # iMessage Channel Settings
    imessage_enabled: bool = Field(default=False, description="Whether the Apple iMessage channel is active")
    imessage_server_url: str = Field(default="", description="BlueBubbles server base URL (e.g. http://10.0.0.x:1234)")
    imessage_password: str = Field(default="", description="BlueBubbles server password")
    imessage_allowed_senders: List[str] = Field(default_factory=list, description="Allowed iMessage Apple IDs or phone numbers (empty for all)")
    imessage_show_tools: bool = Field(default=False, description="Send tool execution updates in iMessage")

    # Custom Branding Settings
    brand_prefix: str = Field(default="Google", description="Brand prefix or organization name")
    brand_name: str = Field(default="Antigravity", description="Primary brand or platform name")
    brand_badge: str = Field(default="AGY 2.0", description="Badge text displayed in sidebar header")
    brand_title: str = Field(default="Google Antigravity (agy)", description="Browser page title")
    brand_tagline: str = Field(
        default="Autonomous AI agent for your homelab infrastructure. Monitor system health, manage containers, audit networks, and maintain server reliability.",
        description="Welcome banner hero subtitle / description",
    )
    brand_accent_color: str = Field(default="#3186FF", description="Primary accent color in hex")
    brand_accent_secondary: str = Field(default="#FFE432", description="Secondary accent / highlight color in hex")
    brand_logo_url: str = Field(default="", description="Custom logo image or SVG URL")
    brand_favicon_url: str = Field(default="/static/assets/favicon.svg", description="Custom favicon URL")


def get_default_settings() -> Settings:
    d_token = os.environ.get("DISCORD_BOT_TOKEN", "")
    t_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    w_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
    im_url = os.environ.get("IMESSAGE_SERVER_URL", "")
    return Settings(
        discord_bot_token=d_token,
        discord_enabled=bool(d_token),
        telegram_bot_token=t_token,
        telegram_enabled=bool(t_token),
        whatsapp_access_token=w_token,
        whatsapp_enabled=bool(w_token),
        imessage_server_url=im_url,
        imessage_enabled=bool(im_url),
    )


def load_settings() -> Settings:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not SETTINGS_PATH.exists():
        settings = get_default_settings()
        save_settings(settings)
        return settings

    try:
        with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            loaded = Settings(**data)
            # If loaded agy_bin does not exist, fallback to detected agy binary
            if not os.path.exists(loaded.agy_bin):
                detected = find_agy_bin()
                if os.path.exists(detected) or detected == "agy":
                    loaded.agy_bin = detected
            if not os.path.isdir(loaded.default_cwd):
                loaded.default_cwd = str(Path.home())
            return loaded
    except Exception as e:
        print(f"Warning: Failed to parse {SETTINGS_PATH}: {e}, using defaults")
        return get_default_settings()


def save_settings(settings: Settings) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        f.write(settings.model_dump_json(indent=2))


# Global settings singleton
settings = load_settings()
