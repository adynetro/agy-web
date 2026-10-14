from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BaseChannel(ABC):
    """
    Abstract Base Class for messaging channels (Web UI, Discord, Webhooks, etc.)
    """

    def __init__(self, channel_id: str, channel_name: str, description: str = ""):
        self.channel_id = channel_id
        self.channel_name = channel_name
        self.description = description
        self.is_enabled = False

    @abstractmethod
    async def start(self) -> None:
        """Start background listeners, bot connections, or polling loops."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Gracefully disconnect or stop listeners."""
        pass

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Return channel status for UI and management endpoints."""
        pass

    async def on_turn_start(self, context: Any, conversation_id: str) -> None:
        """Hook called when agy starts processing a turn."""
        pass

    async def on_turn_delta(self, context: Any, delta: str) -> None:
        """Hook called on each streaming response token."""
        pass

    async def on_turn_tool(self, context: Any, tool_name: str, tool_info: Dict[str, Any], state: str) -> None:
        """Hook called when a tool is being called or finishes."""
        pass

    async def on_turn_result(self, context: Any, result: Dict[str, Any]) -> None:
        """Hook called when the turn completes with final response and usage metrics."""
        pass

    async def on_turn_error(self, context: Any, error: str) -> None:
        """Hook called on failure or abort."""
        pass
