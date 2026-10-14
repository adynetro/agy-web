from __future__ import annotations
import asyncio
from typing import Any, Dict, Optional
import aiohttp
from app.channels.base import BaseChannel


class WebhookChannel(BaseChannel):
    """
    Generic Webhook channel for programmatic integrations, CI/CD, and external bots.
    """

    def __init__(self):
        super().__init__(
            channel_id="webhook",
            channel_name="Webhook / API",
            description="HTTP webhook trigger & callback interface for automation workflows"
        )
        self.is_enabled = True

    async def start(self) -> None:
        self.is_enabled = True

    async def stop(self) -> None:
        self.is_enabled = False

    def get_status(self) -> Dict[str, Any]:
        return {
            "id": self.channel_id,
            "name": self.channel_name,
            "enabled": self.is_enabled,
            "status": "online",
            "endpoint": "/api/channels/webhook/trigger",
        }

    async def send_callback(self, callback_url: str, payload: Dict[str, Any]) -> bool:
        """Sends agent result to an external webhook URL."""
        if not callback_url:
            return False
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(callback_url, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    return resp.status < 300
        except Exception as e:
            print(f"[Webhook] Failed to send callback to {callback_url}: {e}")
            return False


webhook_channel = WebhookChannel()
