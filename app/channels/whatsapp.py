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

MAPPINGS_FILE = Path(__file__).resolve().parent.parent.parent / "config" / "whatsapp_conv_map.json"
META_GRAPH_BASE = "https://graph.facebook.com/v21.0"


def split_whatsapp_message(content: str, max_length: int = 4000) -> List[str]:
    """
    Splits long markdown text into WhatsApp-safe chunks (limit is 4096 chars),
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


class WhatsAppChannel(BaseChannel):
    """
    WhatsApp channel supporting both official Meta Cloud API and
    self-hosted Webhook Bridges (Evolution API, Baileys, WPPConnect, UltraMsg).
    """

    def __init__(self):
        super().__init__(
            channel_id="whatsapp",
            channel_name="WhatsApp",
            description="WhatsApp messaging adapter supporting Meta Cloud API and local Baileys/Evolution gateways"
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
            print(f"[WhatsApp] Error saving mappings: {e}")

    def get_status(self) -> Dict[str, Any]:
        enabled = getattr(settings, "whatsapp_enabled", False)
        mode = getattr(settings, "whatsapp_mode", "cloud_api")
        phone_id = getattr(settings, "whatsapp_phone_number_id", "")
        token = getattr(settings, "whatsapp_access_token", "")
        gateway_url = getattr(settings, "whatsapp_gateway_url", "")

        configured = bool((mode == "cloud_api" and phone_id and token) or (mode == "gateway" and gateway_url))
        is_online = enabled and configured

        return {
            "id": self.channel_id,
            "name": self.channel_name,
            "enabled": enabled,
            "configured": configured,
            "status": "online" if is_online else ("ready" if configured else "offline"),
            "mode": mode,
            "phone_number_id": phone_id if phone_id else None,
            "gateway_url": gateway_url if gateway_url else None,
            "webhook_path": "/api/channels/whatsapp/webhook",
            "tracked_contacts": len(self._conv_map),
            "last_error": self._last_error,
        }

    async def start(self) -> None:
        enabled = getattr(settings, "whatsapp_enabled", False)
        self.is_enabled = enabled
        self._last_error = None
        print(f"[WhatsApp] Channel initialized (enabled={enabled}, mode={getattr(settings, 'whatsapp_mode', 'cloud_api')})")

    async def stop(self) -> None:
        self.is_enabled = False

    def _is_number_allowed(self, phone: str) -> bool:
        allowed = getattr(settings, "whatsapp_allowed_numbers", [])
        if not allowed:
            return True  # Empty means allow all

        clean_incoming = re.sub(r"[^\d]", "", phone)
        for item in allowed:
            clean_item = re.sub(r"[^\d]", "", item)
            if clean_item and clean_item == clean_incoming:
                return True
        return False

    async def handle_inbound_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parses incoming webhook payload from Meta Cloud API or local gateway bridges.
        """
        if not getattr(settings, "whatsapp_enabled", False):
            return {"status": "ignored", "reason": "whatsapp_channel_disabled"}

        messages_to_process: List[Dict[str, str]] = []

        # 1. Meta Cloud API format
        if "entry" in data:
            for entry in data.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    for msg in value.get("messages", []):
                        sender = msg.get("from")
                        msg_type = msg.get("type")
                        text_body = ""
                        if msg_type == "text":
                            text_body = msg.get("text", {}).get("body", "")
                        if sender and text_body:
                            messages_to_process.append({"sender": sender, "text": text_body})

        # 2. Generic / Evolution / Baileys bridge formats
        elif "data" in data and isinstance(data["data"], dict):
            d = data["data"]
            # Evolution API / Baileys structure
            remote_jid = d.get("key", {}).get("remoteJid") or d.get("remoteJid")
            sender = re.sub(r"@.*", "", remote_jid or "")
            body = (
                d.get("message", {}).get("conversation")
                or d.get("message", {}).get("extendedTextMessage", {}).get("text")
                or d.get("body")
                or ""
            )
            is_from_me = d.get("key", {}).get("fromMe", False)
            if sender and body and not is_from_me:
                messages_to_process.append({"sender": sender, "text": body})

        # 3. Flat simple webhook bridge: { "from": "...", "body": "..." } or { "sender": "...", "text": "..." }
        elif "from" in data and ("body" in data or "text" in data or "message" in data):
            sender = str(data.get("from"))
            text = str(data.get("body") or data.get("text") or data.get("message") or "")
            if sender and text:
                messages_to_process.append({"sender": sender, "text": text})

        elif "sender" in data and ("text" in data or "message" in data):
            sender = str(data.get("sender"))
            text = str(data.get("text") or data.get("message") or "")
            if sender and text:
                messages_to_process.append({"sender": sender, "text": text})

        if not messages_to_process:
            return {"status": "ok", "processed": 0}

        # Process each detected message asynchronously
        for item in messages_to_process:
            asyncio.create_task(self._process_message(item["sender"], item["text"]))

        return {"status": "ok", "queued": len(messages_to_process)}

    async def _process_message(self, sender: str, text: str) -> None:
        clean_sender = re.sub(r"[^\d]", "", sender)
        if not clean_sender or not text.strip():
            return

        # Check authorization
        if not self._is_number_allowed(clean_sender):
            await self.send_message(
                clean_sender,
                "⛔ *Access Restricted*\nYour phone number is not authorized to interact with this Antigravity instance."
            )
            return

        chat_key = clean_sender
        trimmed = text.strip()

        # Handle built-in commands
        if trimmed.startswith("!") or trimmed.startswith("/"):
            parts = trimmed.split(maxsplit=1)
            cmd = parts[0].lower().lstrip("!/")
            arg = parts[1].strip() if len(parts) > 1 else ""

            if cmd in ("start", "help"):
                help_msg = (
                    "🚀 *Antigravity (agy) WhatsApp Gateway*\n\n"
                    "• Simply message your task or prompt to execute with your homelab agent\n"
                    "• `!new` or `!reset`: Start a fresh conversation\n"
                    "• `!status`: Check agent health & active model\n"
                    "• `!btw <hint>`: Provide steering guidance to a running turn\n\n"
                    f"🧠 *Model:* {settings.default_model}\n"
                    f"⚙️ *Mode:* {settings.default_mode}"
                )
                await self.send_message(clean_sender, help_msg)
                return

            if cmd in ("new", "reset"):
                self._conv_map.pop(chat_key, None)
                self._save_mappings()
                await self.send_message(clean_sender, "🔄 *Conversation reset.* What would you like to work on next?")
                return

            if cmd == "status":
                active_conv = self._conv_map.get(chat_key, "None (will create on next prompt)")
                status_text = (
                    "🤖 *Agent Status:* Online\n"
                    f"🧠 *Model:* {settings.default_model}\n"
                    f"⚡ *Effort:* {settings.default_effort}\n"
                    f"💬 *Active Conversation:* {active_conv}"
                )
                await self.send_message(clean_sender, status_text)
                return

            if cmd == "btw":
                if not arg:
                    await self.send_message(clean_sender, "⚠️ Usage: `!btw <steering message>`")
                    return
                conv_id = self._conv_map.get(chat_key)
                if not conv_id:
                    await self.send_message(clean_sender, "⚠️ No active conversation to steer for this contact.")
                    return
                from app.processes import process_manager
                process_manager.inject_steering(conversation_id=conv_id, message=arg, interrupt=False)
                await self.send_message(clean_sender, f"⚡ *Steering hint injected:* \"{arg}\"")
                return

        # Execute turn
        await self._handle_turn(clean_sender, chat_key, trimmed)

    async def _handle_turn(self, sender: str, chat_key: str, prompt: str) -> None:
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

                elif ev_type == "tool" and getattr(settings, "whatsapp_show_tools", False):
                    tool_name = event.get("tool_name", "tool")
                    state = event.get("state", "")
                    now = asyncio.get_event_loop().time()
                    if now - last_tool_update > 4.0:
                        last_tool_update = now
                        await self.send_message(sender, f"⚙️ *Executing tool:* `{tool_name}` ({state})...")

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
            await self.send_message(sender, f"⚠️ *Error executing request:*\n{error_msg}")
            return

        if not final_response:
            final_response = "*(No text response generated)*"

        chunks = split_whatsapp_message(final_response)
        for chunk in chunks:
            await self.send_message(sender, chunk)

    async def send_message(self, recipient: str, text: str) -> bool:
        mode = getattr(settings, "whatsapp_mode", "cloud_api")

        if mode == "cloud_api":
            return await self._send_meta_cloud_api(recipient, text)
        else:
            return await self._send_gateway_bridge(recipient, text)

    async def _send_meta_cloud_api(self, recipient: str, text: str) -> bool:
        phone_id = getattr(settings, "whatsapp_phone_number_id", "")
        token = getattr(settings, "whatsapp_access_token", "")
        if not phone_id or not token:
            self._last_error = "Meta WhatsApp credentials missing (phone_number_id or access_token)"
            return False

        url = f"{META_GRAPH_BASE}/{phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                    res_json = await resp.json()
                    if resp.status >= 300:
                        self._last_error = f"Meta API error ({resp.status}): {res_json}"
                        print(f"[WhatsApp] {self._last_error}")
                        return False
                    return True
        except Exception as e:
            self._last_error = str(e)
            print(f"[WhatsApp] Failed to send Cloud API message: {e}")
            return False

    async def _send_gateway_bridge(self, recipient: str, text: str) -> bool:
        gateway_url = getattr(settings, "whatsapp_gateway_url", "")
        token = getattr(settings, "whatsapp_gateway_token", "")
        if not gateway_url:
            self._last_error = "WhatsApp gateway URL is not configured"
            return False

        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
            headers["apikey"] = token

        # Payload formatted to support Evolution API, Baileys, and generic webhooks
        payload = {
            "number": recipient,
            "to": recipient,
            "recipient": recipient,
            "text": text,
            "message": text,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(gateway_url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                    if resp.status >= 300:
                        res_text = await resp.text()
                        self._last_error = f"Gateway error ({resp.status}): {res_text[:120]}"
                        return False
                    return True
        except Exception as e:
            self._last_error = str(e)
            print(f"[WhatsApp] Failed to send via gateway: {e}")
            return False


whatsapp_channel = WhatsAppChannel()
