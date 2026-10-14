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


def get_default_settings() -> Settings:
    token = os.environ.get("DISCORD_BOT_TOKEN", "")
    enabled = bool(token)
    return Settings(
        discord_bot_token=token,
        discord_enabled=enabled,
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
