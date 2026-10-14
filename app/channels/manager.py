from __future__ import annotations
import asyncio
from typing import Any, Dict, List, Optional
from app.channels.base import BaseChannel
from app.channels.web import web_channel
from app.channels.discord import discord_channel
from app.channels.webhook import webhook_channel
from app.engine import engine


class ChannelManager:
    """
    Central manager and registry for messaging channels.
    Allows easy addition of new channels (Slack, Telegram, Matrix, etc.).
    """

    def __init__(self):
        self._channels: Dict[str, BaseChannel] = {}
        # Register default channels
        self.register_channel(web_channel)
        self.register_channel(discord_channel)
        self.register_channel(webhook_channel)

        # Wire up engine
        discord_channel.engine = engine

    def register_channel(self, channel: BaseChannel) -> None:
        self._channels[channel.channel_id] = channel

    def get_channel(self, channel_id: str) -> Optional[BaseChannel]:
        return self._channels.get(channel_id)

    def list_channels(self) -> List[Dict[str, Any]]:
        return [ch.get_status() for ch in self._channels.values()]

    async def start_all(self) -> None:
        for ch in self._channels.values():
            try:
                await ch.start()
            except Exception as e:
                print(f"Error starting channel {ch.channel_id}: {e}")

    async def stop_all(self) -> None:
        for ch in self._channels.values():
            try:
                await ch.stop()
            except Exception as e:
                print(f"Error stopping channel {ch.channel_id}: {e}")


channel_manager = ChannelManager()
