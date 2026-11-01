from __future__ import annotations
import asyncio
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
import aiohttp

from app.channels.base import BaseChannel
from app.config import settings, save_settings

MAPPINGS_FILE = Path(__file__).resolve().parent.parent.parent / "config" / "imessage_conv_map.json"


def split_imessage_text(content: str, max_length: int = 4000) -> List[str]:
    """
    Splits long markdown/plain text into iMessage chunks,
    preserving code blocks where possible.
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


class IMessageChannel(BaseChannel):
    """
    iMessage channel integrating with BlueBubbles Server or generic iMessage bridges.
    Supports multi-turn conversations, tool updates, and sender authorization.
    """

    def __init__(self):
        super().__init__(
            channel_id="imessage",
            channel_name="iMessage",
            description="Apple iMessage integration via BlueBubbles server REST API and webhooks"
        )
        self._last_error: Optional[str] = None
        self._conv_map: Dict[str, str] = self._load_mappings()
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
            print(f"[iMessage] Error saving mappings: {e}")

    def get_status(self) -> Dict[str, Any]:
        enabled = getattr(settings, "imessage_enabled", False)
        server_url = getattr(settings, "imessage_server_url", "")
        has_password = bool(getattr(settings, "imessage_password", ""))
        configured = bool(server_url and has_password)
        is_online = enabled and configured

        return {
            "id": self.channel_id,
            "name": self.channel_name,
            "enabled": enabled,
            "configured": configured,
            "status": "online" if is_online else ("ready" if configured else "offline"),
            "server_url": server_url if server_url else None,
            "webhook_path": "/api/channels/imessage/webhook",
            "tracked_chats": len(self._conv_map),
            "last_error": self._last_error,
        }

    async def start(self) -> None:
        enabled = getattr(settings, "imessage_enabled", False)
        self.is_enabled = enabled
        self._last_error = None
        print(f"[iMessage] Channel initialized (enabled={enabled}, server={getattr(settings, 'imessage_server_url', 'None')})")

    async def stop(self) -> None:
        self.is_enabled = False

    def _is_sender_allowed(self, sender: str) -> bool:
        allowed = getattr(settings, "imessage_allowed_senders", [])
        if not allowed:
            return True  # Empty means allow all

        sender_clean = sender.strip().lower()
        sender_digits = re.sub(r"[^\d]", "", sender)

        for item in allowed:
            item_clean = item.strip().lower()
            item_digits = re.sub(r"[^\d]", "", item)
            if item_clean == sender_clean:
                return True
            if item_digits and sender_digits and item_digits == sender_digits:
                return True
        return False

    async def handle_inbound_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes webhook events from BlueBubbles or generic iMessage bridges.
        """
        if not getattr(settings, "imessage_enabled", False):
            return {"status": "ignored", "reason": "imessage_channel_disabled"}

        sender = ""
        text = ""
        chat_guid = ""

        # 1. BlueBubbles format: { "type": "new-message", "data": { ... } }
        if data.get("type") == "new-message" and isinstance(data.get("data"), dict):
            msg_data = data["data"]
            # Ignore messages sent by ourselves
            if msg_data.get("isFromMe", False):
                return {"status": "ignored", "reason": "self_message"}

            text = msg_data.get("text", "") or ""
            handle = msg_data.get("handle", {})
            sender = handle.get("address", "") if isinstance(handle, dict) else ""
            chats = msg_data.get("chats", [])
            if chats and isinstance(chats, list) and isinstance(chats[0], dict):
                chat_guid = chats[0].get("guid", "")

        # 2. Generic flat format: { "sender": "...", "text": "...", "chat_guid": "..." }
        elif "text" in data or "message" in data:
            text = str(data.get("text") or data.get("message") or "")
            sender = str(data.get("sender") or data.get("from") or "")
            chat_guid = str(data.get("chat_guid") or data.get("chatGuid") or "")

        if not text.strip() or not (sender or chat_guid):
            return {"status": "ignored", "reason": "empty_payload_or_sender"}

        target_guid = chat_guid or f"iMessage;-;{sender}"
        asyncio.create_task(self._process_message(sender, target_guid, text.strip()))
        return {"status": "ok", "queued": 1}

    async def _process_message(self, sender: str, chat_guid: str, text: str) -> None:
        # Check authorization
        if sender and not self._is_sender_allowed(sender):
            await self.send_message(
                chat_guid,
                "⛔ Access Restricted: Your iMessage handle is not authorized to interact with this Antigravity instance."
            )
            return

        chat_key = chat_guid
        trimmed = text.strip()

        # Handle commands
        if trimmed.startswith("!") or trimmed.startswith("/"):
            parts = trimmed.split(maxsplit=1)
            cmd = parts[0].lower().lstrip("!/")
            arg = parts[1].strip() if len(parts) > 1 else ""

            if cmd in ("start", "help"):
                help_msg = (
                    "🚀 Antigravity (agy) iMessage Gateway\n\n"
                    "• Simply message your task or prompt to execute with your homelab agent\n"
                    "• !new or !reset: Start a fresh conversation\n"
                    "• !status: Check agent health & active model\n"
                    "• !btw <hint>: Provide steering guidance to a running turn\n\n"
                    f"🧠 Model: {settings.default_model}\n"
                    f"⚙️ Mode: {settings.default_mode}"
                )
                await self.send_message(chat_guid, help_msg)
                return

            if cmd in ("new", "reset"):
                self._conv_map.pop(chat_key, None)
                self._save_mappings()
                await self.send_message(chat_guid, "🔄 Conversation reset. What would you like to work on next?")
                return

            if cmd == "status":
                active_conv = self._conv_map.get(chat_key, "None (will create on next prompt)")
                status_text = (
                    "🤖 Agent Status: Online\n"
                    f"🧠 Model: {settings.default_model}\n"
                    f"⚡ Effort: {settings.default_effort}\n"
                    f"💬 Active Conversation: {active_conv}"
                )
                await self.send_message(chat_guid, status_text)
                return

            if cmd == "btw":
                if not arg:
                    await self.send_message(chat_guid, "⚠️ Usage: !btw <steering message>")
                    return
                conv_id = self._conv_map.get(chat_key)
                if not conv_id:
                    await self.send_message(chat_guid, "⚠️ No active conversation to steer in this chat.")
                    return
                from app.processes import process_manager
                process_manager.inject_steering(conversation_id=conv_id, message=arg, interrupt=False)
                await self.send_message(chat_guid, f"⚡ Steering hint injected: \"{arg}\"")
                return

        # Execute turn
        await self._handle_turn(chat_guid, chat_key, trimmed)

    async def _handle_turn(self, chat_guid: str, chat_key: str, prompt: str) -> None:
        conv_id = self._conv_map.get(chat_key)

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

                elif ev_type == "tool" and getattr(settings, "imessage_show_tools", False):
                    tool_name = event.get("tool_name", "tool")
                    state = event.get("state", "")
                    now = asyncio.get_event_loop().time()
                    if now - last_tool_update > 4.0:
                        last_tool_update = now
                        await self.send_message(chat_guid, f"⚙️ Executing tool: {tool_name} ({state})...")

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

        if error_msg:
            await self.send_message(chat_guid, f"⚠️ Error executing request:\n{error_msg}")
            return

        if not final_response:
            final_response = "(No text response generated)"

        chunks = split_imessage_text(final_response)
        for chunk in chunks:
            await self.send_message(chat_guid, chunk)

    async def send_message(self, chat_guid: str, text: str) -> bool:
        server_url = getattr(settings, "imessage_server_url", "").rstrip("/")
        password = getattr(settings, "imessage_password", "")
        if not server_url or not password:
            self._last_error = "BlueBubbles credentials missing (server_url or password)"
            return False

        endpoint = f"{server_url}/api/v1/message/text"
        params = {"password": password}
        headers = {
            "Authorization": f"Bearer {password}",
            "Content-Type": "application/json",
        }
        payload = {
            "chatGuid": chat_guid,
            "tempGuid": f"temp-{uuid.uuid4()}",
            "message": text,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(endpoint, json=payload, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                    if resp.status >= 300:
                        res_text = await resp.text()
                        self._last_error = f"BlueBubbles error ({resp.status}): {res_text[:120]}"
                        print(f"[iMessage] {self._last_error}")
                        return False
                    return True
        except Exception as e:
            self._last_error = str(e)
            print(f"[iMessage] Failed to send message: {e}")
            return False


imessage_channel = IMessageChannel()
