from __future__ import annotations
import asyncio
import json
from typing import Any, Dict, Set
from fastapi import WebSocket
from app.channels.base import BaseChannel


class WebChannel(BaseChannel):
    """
    Channel adapter for the Browser Web UI via WebSockets.
    """

    def __init__(self):
        super().__init__(
            channel_id="web",
            channel_name="Web Interface",
            description="Browser-based real-time chat UI with full tool and markdown support"
        )
        self.is_enabled = True
        # Maps conversation_id -> set of active WebSockets
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._global_listeners: Set[WebSocket] = set()

    async def start(self) -> None:
        self.is_enabled = True

    async def stop(self) -> None:
        # Close all active websockets
        for conv_id, conns in list(self._connections.items()):
            for ws in list(conns):
                try:
                    await ws.close()
                except Exception:
                    pass
        self._connections.clear()
        self._global_listeners.clear()

    def get_status(self) -> Dict[str, Any]:
        total_active_ws = sum(len(conns) for conns in self._connections.values()) + len(self._global_listeners)
        return {
            "id": self.channel_id,
            "name": self.channel_name,
            "enabled": self.is_enabled,
            "status": "online",
            "active_connections": total_active_ws,
            "conversations_tracked": len(self._connections),
        }

    def register_client(self, websocket: WebSocket, conversation_id: Optional[str] = None) -> None:
        if conversation_id:
            if conversation_id not in self._connections:
                self._connections[conversation_id] = set()
            self._connections[conversation_id].add(websocket)
        else:
            self._global_listeners.add(websocket)

    def unregister_client(self, websocket: WebSocket, conversation_id: Optional[str] = None) -> None:
        if conversation_id and conversation_id in self._connections:
            self._connections[conversation_id].discard(websocket)
            if not self._connections[conversation_id]:
                del self._connections[conversation_id]
        self._global_listeners.discard(websocket)

    async def broadcast(self, conversation_id: str, message: Dict[str, Any]) -> None:
        """Sends a JSON message to all connected clients for this conversation."""
        payload = json.dumps(message)
        targets = set(self._connections.get(conversation_id, set())) | self._global_listeners
        for ws in list(targets):
            try:
                await ws.send_text(payload)
            except Exception:
                self.unregister_client(ws, conversation_id)

    async def on_turn_start(self, context: Any, conversation_id: str) -> None:
        await self.broadcast(conversation_id, {
            "type": "turn_start",
            "conversation_id": conversation_id,
        })

    async def on_turn_delta(self, context: Any, delta: str) -> None:
        conv_id = context.get("conversation_id", "")
        if conv_id:
            await self.broadcast(conv_id, {
                "type": "token",
                "delta": delta,
            })

    async def on_turn_tool(self, context: Any, tool_name: str, tool_info: Dict[str, Any], state: str) -> None:
        conv_id = context.get("conversation_id", "")
        if conv_id:
            await self.broadcast(conv_id, {
                "type": "tool",
                "tool_name": tool_name,
                "tool_info": tool_info,
                "state": state,
            })

    async def on_turn_result(self, context: Any, result: Dict[str, Any]) -> None:
        conv_id = result.get("conversation_id") or context.get("conversation_id", "")
        if conv_id:
            await self.broadcast(conv_id, {
                "type": "result",
                "result": result,
            })

    async def on_turn_error(self, context: Any, error: str) -> None:
        conv_id = context.get("conversation_id", "")
        if conv_id:
            await self.broadcast(conv_id, {
                "type": "error",
                "error": error,
            })


web_channel = WebChannel()
