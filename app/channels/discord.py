from __future__ import annotations
import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
import discord
from app.channels.base import BaseChannel
from app.config import settings, save_settings

MAPPINGS_FILE = Path(__file__).resolve().parent.parent.parent / "config" / "discord_conv_map.json"


def split_discord_message(content: str, max_length: int = 1900) -> List[str]:
    """
    Splits long markdown text into Discord-safe chunks (<2000 chars),
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
        # Track code blocks
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


class DiscordChannel(BaseChannel):
    """
    Discord Bot channel allowing users to chat with agy from Discord.
    """

    def __init__(self):
        super().__init__(
            channel_id="discord",
            channel_name="Discord Bot",
            description="Interactive Discord Bot adapter with multi-turn threads and tool execution updates"
        )
        self.bot_token = settings.discord_bot_token
        self.prefix = settings.discord_prefix
        self.client: Optional[discord.Client] = None
        self._bot_task: Optional[asyncio.Task] = None
        self._last_error: Optional[str] = None
        self._conv_map: Dict[str, str] = self._load_mappings()
        self.engine: Optional[Any] = None  # Injected by manager

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
            print(f"Error saving Discord mappings: {e}")

    def get_status(self) -> Dict[str, Any]:
        is_ready = self.client.is_ready() if self.client else False
        user_str = str(self.client.user) if (self.client and self.client.user) else None
        guild_count = len(self.client.guilds) if (self.client and is_ready) else 0

        return {
            "id": self.channel_id,
            "name": self.channel_name,
            "enabled": settings.discord_enabled,
            "configured": bool(self.bot_token),
            "status": "online" if is_ready else ("connecting" if self._bot_task else "offline"),
            "bot_user": user_str,
            "guilds": guild_count,
            "prefix": self.prefix,
            "tracked_threads": len(self._conv_map),
            "last_error": self._last_error,
        }

    async def start(self) -> None:
        self.bot_token = settings.discord_bot_token
        self.prefix = settings.discord_prefix

        if not settings.discord_enabled or not self.bot_token:
            self.is_enabled = False
            return

        await self.stop()
        self._last_error = None

        intents = discord.Intents.default()
        intents.message_content = True
        intents.guilds = True

        self.client = discord.Client(intents=intents)

        @self.client.event
        async def on_ready():
            print(f"[Discord] Logged in as {self.client.user} (ID: {self.client.user.id})")
            self.is_enabled = True

        @self.client.event
        async def on_message(message: discord.Message):
            # Ignore self
            if message.author == self.client.user or message.author.bot:
                return

            # Check permissions/guild filter
            if settings.discord_allowed_guilds and message.guild:
                if str(message.guild.id) not in settings.discord_allowed_guilds:
                    return

            if settings.discord_allowed_channels:
                if str(message.channel.id) not in settings.discord_allowed_channels:
                    return

            content = message.content.strip()
            is_dm = isinstance(message.channel, discord.DMChannel)
            is_mention = self.client.user in message.mentions if self.client.user else False
            starts_with_prefix = content.startswith(self.prefix)

            # Determine if this message is for agy
            if not (is_dm or is_mention or starts_with_prefix):
                # Also check if it's a reply in an active thread mapped to an agy conversation
                if str(message.channel.id) not in self._conv_map:
                    return

            # Strip mention or prefix
            prompt = content
            if starts_with_prefix:
                prompt = content[len(self.prefix):].strip()
            elif is_mention and self.client.user:
                prompt = re.sub(rf"<@!?{self.client.user.id}>", "", content).strip()

            if not prompt:
                await message.reply(f"Hello! Ask me anything with `{self.prefix} <your question>`.")
                return

            # Handle built-in bot commands
            if prompt.lower() == "help":
                help_text = (
                    "**Antigravity (agy) Discord Bot**\n"
                    f"• `{self.prefix} <prompt>`: Send prompt to agy agent\n"
                    f"• `{self.prefix} new`: Start a fresh conversation in this channel/thread\n"
                    f"• `{self.prefix} status`: Display current bot & agent status\n"
                    f"• Or simply `@mention` me or reply in an existing thread!"
                )
                await message.reply(help_text)
                return

            if prompt.lower() == "new":
                chan_key = str(message.channel.id)
                self._conv_map.pop(chan_key, None)
                self._save_mappings()
                await message.reply("🔄 Conversation reset. What would you like to work on next?")
                return

            if prompt.lower() == "status":
                chan_key = str(message.channel.id)
                active_conv = self._conv_map.get(chan_key, "None (will create on next prompt)")
                await message.reply(
                    f"🤖 **Status:** Online\n"
                    f"🧠 **Model:** `{settings.default_model}`\n"
                    f"💬 **Active Conversation:** `{active_conv}`"
                )
                return

            # Process prompt
            asyncio.create_task(self._handle_user_prompt(message, prompt))

        # Start bot in background task
        self._bot_task = asyncio.create_task(self._run_bot())

    async def _run_bot(self) -> None:
        try:
            assert self.client is not None
            await self.client.start(self.bot_token)
        except Exception as e:
            self._last_error = str(e)
            print(f"[Discord] Bot error: {e}")
            self.is_enabled = False

    async def _handle_user_prompt(self, message: discord.Message, prompt: str) -> None:
        target_channel = message.channel
        chan_key = str(target_channel.id)

        # Auto-thread if requested and in a text channel
        if settings.discord_auto_thread and isinstance(target_channel, discord.TextChannel):
            try:
                thread_name = prompt[:45] + ("..." if len(prompt) > 45 else "")
                target_channel = await message.create_thread(name=thread_name, auto_archive_duration=60)
                chan_key = str(target_channel.id)
            except Exception as e:
                print(f"[Discord] Could not create thread: {e}")

        conv_id = self._conv_map.get(chan_key)

        status_msg: Optional[discord.Message] = None
        try:
            status_msg = await target_channel.send("🤔 *Antigravity is thinking...*")
        except Exception as e:
            print(f"[Discord] Error sending status message: {e}")

        # Typing indicator loop
        async def keep_typing():
            try:
                while True:
                    await target_channel.typing()
                    await asyncio.sleep(8)
            except asyncio.CancelledError:
                pass

        typing_task = asyncio.create_task(keep_typing())

        last_tool_update = 0.0
        final_response = ""
        captured_conv_id = conv_id
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
                        captured_conv_id = init_id
                        self._conv_map[chan_key] = init_id
                        self._save_mappings()

                elif ev_type == "tool" and settings.discord_show_tools and status_msg:
                    tool_name = event.get("tool_name", "tool")
                    state = event.get("state", "")
                    now = asyncio.get_event_loop().time()
                    if now - last_tool_update > 2.0:
                        last_tool_update = now
                        try:
                            await status_msg.edit(content=f"⚙️ *Executing tool:* `{tool_name}` ({state})...")
                        except Exception:
                            pass

                elif ev_type == "result":
                    final_response = event.get("response", "")
                    res_conv_id = event.get("conversation_id")
                    if res_conv_id:
                        captured_conv_id = res_conv_id
                        self._conv_map[chan_key] = res_conv_id
                        self._save_mappings()

                elif ev_type == "error":
                    error_msg = event.get("error", "Unknown error")

        except Exception as e:
            error_msg = str(e)
        finally:
            typing_task.cancel()

        # Send final message(s)
        if error_msg:
            reply_text = f"⚠️ **Error executing request:**\n```{error_msg}```"
            if status_msg:
                try:
                    await status_msg.edit(content=reply_text)
                except Exception:
                    await target_channel.send(reply_text)
            else:
                await target_channel.send(reply_text)
            return

        if not final_response:
            final_response = "*(No text response generated)*"

        chunks = split_discord_message(final_response)

        # Edit first chunk into status message, or send new message
        if status_msg and chunks:
            try:
                await status_msg.edit(content=chunks[0])
                chunks = chunks[1:]
            except Exception:
                pass

        for chunk in chunks:
            try:
                await target_channel.send(chunk)
            except Exception as e:
                print(f"[Discord] Error sending chunk: {e}")

    async def stop(self) -> None:
        if self._bot_task and not self._bot_task.done():
            self._bot_task.cancel()
            try:
                await self._bot_task
            except asyncio.CancelledError:
                pass
            self._bot_task = None

        if self.client and not self.client.is_closed():
            try:
                await self.client.close()
            except Exception:
                pass
            self.client = None

        self.is_enabled = False


discord_channel = DiscordChannel()
