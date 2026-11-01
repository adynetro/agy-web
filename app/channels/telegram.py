from __future__ import annotations
import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
import aiohttp

from app.channels.base import BaseChannel
from app.config import settings, save_settings

MAPPINGS_FILE = Path(__file__).resolve().parent.parent.parent / "config" / "telegram_conv_map.json"
TELEGRAM_API_BASE = "https://api.telegram.org"


def split_telegram_message(content: str, max_length: int = 4000) -> List[str]:
    """
    Splits long markdown text into Telegram-safe chunks (limit is 4096 chars),
    preserving code block formatting across chunks where possible.
    """
    if len(content) <= max_length:
        return [content]

    chunks: List[str] = []
    lines = content.splitlines(keepends=True)
    current_chunk = ""
    in_code_block = False
    code_lang = ""

    for line in lines:
        if line.strip().startswith("```"):
            if not in_code_block:
                in_code_block = True
                code_lang = line.strip().lstrip("`")
            else:
                in_code_block = False
                code_lang = ""

        if len(current_chunk) + len(line) > max_length:
            if in_code_block:
                current_chunk += "\n```"
                chunks.append(current_chunk)
                current_chunk = f"```{code_lang}\n" + line
            else:
                chunks.append(current_chunk)
                current_chunk = line
        else:
            current_chunk += line

    if current_chunk.strip():
        chunks.append(current_chunk)

    return chunks


class TelegramChannel(BaseChannel):
    """
    Telegram Bot channel allowing users to chat with agy from Telegram
    via long-polling or webhook.
    """

    def __init__(self):
        super().__init__(
            channel_id="telegram",
            channel_name="Telegram Bot",
            description="Interactive Telegram Bot adapter with multi-turn sessions and tool execution updates"
        )
        self.bot_token = getattr(settings, "telegram_bot_token", "")
        self._bot_username: Optional[str] = None
        self._bot_id: Optional[int] = None
        self._poll_task: Optional[asyncio.Task] = None
        self._last_error: Optional[str] = None
        self._conv_map: Dict[str, str] = self._load_mappings()
        self._update_offset: int = 0
        self.engine: Optional[Any] = None

    def _load_mappings(self) -> Dict[str, str]:
        if MAPPINGS_FILE.exists():
            try:
                with open(MAPPINGS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_mappings(self) -> None:
        try:
            MAPPINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(MAPPINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(self._conv_map, f, indent=2)
        except Exception as e:
            print(f"[Telegram] Error saving mappings: {e}")

    def get_status(self) -> Dict[str, Any]:
        is_online = self.is_enabled and bool(self._poll_task and not self._poll_task.done())
        return {
            "id": self.channel_id,
            "name": self.channel_name,
            "enabled": getattr(settings, "telegram_enabled", False),
            "configured": bool(self.bot_token),
            "status": "online" if is_online else ("connecting" if self._poll_task else "offline"),
            "bot_user": self._bot_username,
            "bot_id": self._bot_id,
            "tracked_chats": len(self._conv_map),
            "last_error": self._last_error,
        }

    async def start(self) -> None:
        self.bot_token = getattr(settings, "telegram_bot_token", "").strip()
        enabled = getattr(settings, "telegram_enabled", False)

        if not enabled or not self.bot_token:
            self.is_enabled = False
            await self.stop()
            return

        await self.stop()
        self._last_error = None

        # Verify bot token with getMe
        try:
            bot_info = await self._api_request("getMe")
            if bot_info and bot_info.get("ok"):
                res = bot_info.get("result", {})
                self._bot_username = res.get("username")
                self._bot_id = res.get("id")
                self.is_enabled = True
                print(f"[Telegram] Bot authorized as @{self._bot_username} (ID: {self._bot_id})")
            else:
                self._last_error = bot_info.get("description", "Failed to authorize Telegram bot")
                self.is_enabled = False
                print(f"[Telegram] Auth failed: {self._last_error}")
                return
        except Exception as e:
            self._last_error = str(e)
            self.is_enabled = False
            print(f"[Telegram] Connection error: {e}")
            return

        # Start polling task
        self._poll_task = asyncio.create_task(self._polling_loop())

    async def stop(self) -> None:
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None
        self.is_enabled = False

    async def _api_request(self, method: str, payload: Optional[Dict[str, Any]] = None, timeout_seconds: int = 30) -> Dict[str, Any]:
        url = f"{TELEGRAM_API_BASE}/bot{self.bot_token}/{method}"
        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            if payload:
                async with session.post(url, json=payload) as resp:
                    return await resp.json()
            else:
                async with session.get(url) as resp:
                    return await resp.json()

    async def _polling_loop(self) -> None:
        print("[Telegram] Polling loop started")
        backoff = 2
        while self.is_enabled:
            try:
                payload = {
                    "offset": self._update_offset,
                    "timeout": 20,
                    "allowed_updates": ["message"]
                }
                res = await self._api_request("getUpdates", payload, timeout_seconds=30)
                if not res.get("ok"):
                    self._last_error = res.get("description", "Error fetching updates")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 30)
                    continue

                backoff = 2  # Reset backoff on success
                updates = res.get("result", [])
                for update in updates:
                    update_id = update.get("update_id", 0)
                    if update_id >= self._update_offset:
                        self._update_offset = update_id + 1

                    message = update.get("message")
                    if message:
                        asyncio.create_task(self._process_message(message))

            except asyncio.CancelledError:
                break
            except Exception as e:
                self._last_error = str(e)
                print(f"[Telegram] Polling error: {e}")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

        print("[Telegram] Polling loop ended")

    def _is_user_allowed(self, user: Dict[str, Any]) -> bool:
        allowed = getattr(settings, "telegram_allowed_users", [])
        if not allowed:
            return True  # Empty means allow all

        username = (user.get("username") or "").lower()
        user_id = str(user.get("id") or "")

        for item in allowed:
            item_clean = item.strip().lstrip("@").lower()
            if item_clean == username or item_clean == user_id:
                return True
        return False

    async def _process_message(self, message: Dict[str, Any]) -> None:
        chat = message.get("chat", {})
        chat_id = chat.get("id")
        from_user = message.get("from", {})
        text = (message.get("text") or "").strip()

        if not chat_id or not text:
            return

        # Check authorization
        if not self._is_user_allowed(from_user):
            await self._send_text(
                chat_id,
                "⛔ *Access Restricted*\nYour Telegram account is not authorized to communicate with this Antigravity instance."
            )
            return

        chat_key = str(chat_id)

        # Handle commands
        if text.startswith("/"):
            parts = text.split(maxsplit=1)
            cmd = parts[0].lower().split("@")[0]  # strip bot username if present, e.g. /help@bot
            arg = parts[1].strip() if len(parts) > 1 else ""

            if cmd in ("/start", "/help"):
                help_msg = (
                    "🚀 *Antigravity (agy) Telegram Gateway*\n\n"
                    "• Simply send any message to chat with your homelab agent\n"
                    "• `/new` or `/reset`: Start a fresh conversation\n"
                    "• `/status`: View active session & agent health\n"
                    "• `/btw <hint>`: Steer the running agent with guidance\n\n"
                    f"🧠 *Model:* `{settings.default_model}`\n"
                    f"⚙️ *Mode:* `{settings.default_mode}`"
                )
                await self._send_text(chat_id, help_msg)
                return

            if cmd in ("/new", "/reset"):
                self._conv_map.pop(chat_key, None)
                self._save_mappings()
                await self._send_text(chat_id, "🔄 *Conversation reset.* What would you like to work on next?")
                return

            if cmd == "/status":
                active_conv = self._conv_map.get(chat_key, "None (will create on next prompt)")
                status_text = (
                    "🤖 *Agent Status:* Online\n"
                    f"🧠 *Model:* `{settings.default_model}`\n"
                    f"⚡ *Effort:* `{settings.default_effort}`\n"
                    f"💬 *Active Conversation:* `{active_conv}`"
                )
                await self._send_text(chat_id, status_text)
                return

            if cmd == "/btw":
                if not arg:
                    await self._send_text(chat_id, "⚠️ Usage: `/btw <steering message>`")
                    return
                conv_id = self._conv_map.get(chat_key)
                if not conv_id:
                    await self._send_text(chat_id, "⚠️ No active conversation to steer in this chat.")
                    return
                from app.processes import process_manager
                res = process_manager.inject_steering(conversation_id=conv_id, message=arg, interrupt=False)
                await self._send_text(chat_id, f"⚡ *Steering hint injected:* \"{arg}\"")
                return

        # Normal prompt turn
        await self._handle_turn(chat_id, chat_key, text)

    async def _handle_turn(self, chat_id: int, chat_key: str, prompt: str) -> None:
        conv_id = self._conv_map.get(chat_key)

        # Send initial status message
        status_msg = await self._send_text(chat_id, "🤔 *Antigravity is thinking...*")
        status_msg_id = status_msg.get("result", {}).get("message_id") if status_msg else None

        # Background typing loop
        async def keep_typing():
            try:
                while True:
                    await self._api_request("sendChatAction", {"chat_id": chat_id, "action": "typing"})
                    await asyncio.sleep(4)
            except asyncio.CancelledError:
                pass

        typing_task = asyncio.create_task(keep_typing())

        last_tool_update = 0.0
        final_response = ""
        error_msg = None

        try:
            if not self.engine:
                from app.engine import engine
                self.engine = engine

            async for event in self.engine.execute_turn(
                prompt=prompt,
                conversation_id=conv_id,
            ):
                ev_type = event.get("event")

                if ev_type == "init":
                    init_id = event.get("conversation_id")
                    if init_id:
                        self._conv_map[chat_key] = init_id
                        self._save_mappings()

                elif ev_type == "tool" and getattr(settings, "telegram_show_tools", True) and status_msg_id:
                    tool_name = event.get("tool_name", "tool")
                    state = event.get("state", "")
                    now = asyncio.get_event_loop().time()
                    if now - last_tool_update > 2.0:
                        last_tool_update = now
                        await self._edit_text(
                            chat_id,
                            status_msg_id,
                            f"⚙️ *Executing tool:* `{tool_name}` ({state})..."
                        )

                elif ev_type == "result":
                    final_response = event.get("response", "")
                    res_conv_id = event.get("conversation_id")
                    if res_conv_id:
                        self._conv_map[chat_key] = res_conv_id
                        self._save_mappings()

                elif ev_type == "error":
                    error_msg = event.get("error", "Unknown error")

        except Exception as e:
            error_msg = str(e)
        finally:
            typing_task.cancel()

        if error_msg:
            err_text = f"⚠️ *Error executing request:*\n`{error_msg}`"
            if status_msg_id:
                await self._edit_text(chat_id, status_msg_id, err_text)
            else:
                await self._send_text(chat_id, err_text)
            return

        if not final_response:
            final_response = "*(No text response generated)*"

        chunks = split_telegram_message(final_response)

        # Edit first chunk into status message if possible
        first_chunk = chunks[0] if chunks else final_response
        if status_msg_id:
            edited = await self._edit_text(chat_id, status_msg_id, first_chunk)
            if not edited or not edited.get("ok"):
                # If markdown parse fails or edit fails, send as fresh message
                await self._send_text(chat_id, first_chunk, parse_mode=None)
            chunks = chunks[1:]

        for chunk in chunks:
            await self._send_text(chat_id, chunk)

    async def _send_text(self, chat_id: int, text: str, parse_mode: Optional[str] = "Markdown") -> Dict[str, Any]:
        payload: Dict[str, Any] = {"chat_id": chat_id, "text": text}
        if parse_mode:
            payload["parse_mode"] = parse_mode
        res = await self._api_request("sendMessage", payload)
        # If Markdown parsing failed, retry plain text
        if not res.get("ok") and parse_mode:
            payload.pop("parse_mode", None)
            res = await self._api_request("sendMessage", payload)
        return res

    async def _edit_text(self, chat_id: int, message_id: int, text: str, parse_mode: Optional[str] = "Markdown") -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        res = await self._api_request("editMessageText", payload)
        if not res.get("ok") and parse_mode:
            payload.pop("parse_mode", None)
            res = await self._api_request("editMessageText", payload)
        return res


telegram_channel = TelegramChannel()
