from __future__ import annotations
import asyncio
import json
import time
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.channels.web import web_channel
from app.config import settings
from app.processes import process_manager
from app.session_manager import session_manager

ws_router = APIRouter()


@ws_router.websocket("/ws/chat")
@ws_router.websocket("/ws/chat/{conversation_id}")
async def websocket_chat_endpoint(websocket: WebSocket, conversation_id: Optional[str] = None):
    await websocket.accept()
    current_conv_id = conversation_id
    web_channel.register_client(websocket, current_conv_id)

    # Immediately synchronize the selected tab on initial connection
    if current_conv_id:
        try:
            state = session_manager.get_session_state(current_conv_id, last_seq=0)
            await websocket.send_text(json.dumps(state))
        except Exception as e:
            print(f"Error sending initial session state for {current_conv_id}: {e}")

    try:
        while True:
            raw_text = await websocket.receive_text()
            if not raw_text:
                continue

            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "error": "Invalid JSON"}))
                continue

            msg_type = data.get("type", "prompt")

            if msg_type in ("subscribe", "resume", "switch_conversation"):
                target_conv_id = data.get("conversation_id")
                last_seq = int(data.get("last_seq", 0))

                if target_conv_id != current_conv_id:
                    web_channel.unregister_client(websocket, current_conv_id)
                    current_conv_id = target_conv_id
                    web_channel.register_client(websocket, current_conv_id)

                if current_conv_id:
                    state = session_manager.get_session_state(current_conv_id, last_seq=last_seq)
                    await websocket.send_text(json.dumps(state))
                else:
                    await websocket.send_text(json.dumps({
                        "type": "session_state",
                        "conversation_id": None,
                        "status": "idle",
                        "is_generating": False,
                        "events": [],
                        "terminal_logs": [],
                    }))
                continue

            if msg_type == "get_terminal_history":
                target_conv_id = data.get("conversation_id") or current_conv_id
                limit = int(data.get("limit", 150))
                if target_conv_id:
                    lines = session_manager.get_terminal_history(target_conv_id, limit=limit)
                    await websocket.send_text(json.dumps({
                        "type": "terminal_history",
                        "conversation_id": target_conv_id,
                        "lines": lines
                    }))
                continue

            if msg_type == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "timestamp": time.time(),
                }))
                continue

            if msg_type == "abort":
                target_conv_id = data.get("conversation_id") or current_conv_id
                if target_conv_id:
                    aborted = await session_manager.abort_turn(target_conv_id)
                    await websocket.send_text(json.dumps({
                        "type": "aborted",
                        "conversation_id": target_conv_id,
                        "success": aborted
                    }))
                continue

            if msg_type == "btw":
                btw_msg = (data.get("message") or data.get("prompt") or "").strip()
                target_conv_id = data.get("conversation_id") or current_conv_id
                interrupt = bool(data.get("interrupt", False))

                if target_conv_id and btw_msg:
                    res = process_manager.inject_steering(
                        conversation_id=target_conv_id,
                        message=btw_msg,
                        interrupt=interrupt,
                    )
                    # Broadcast to all clients for this conversation
                    await web_channel.broadcast(target_conv_id, {
                        "event": "btw_injected",
                        "conversation_id": target_conv_id,
                        "message": btw_msg,
                        "interrupted": res.get("interrupted", False),
                        "timestamp": res.get("timestamp", 0),
                    })
                    await websocket.send_text(json.dumps({
                        "type": "btw_ack",
                        "conversation_id": target_conv_id,
                        "success": True,
                        "message": btw_msg,
                        "interrupted": res.get("interrupted", False),
                    }))
                continue

            if msg_type == "prompt":
                prompt_text = data.get("prompt", "").strip()
                if not prompt_text:
                    continue

                req_conv_id = data.get("conversation_id") or current_conv_id
                model = data.get("model") or settings.default_model
                effort = data.get("effort") or settings.default_effort
                mode = data.get("mode") or settings.default_mode
                cwd = data.get("cwd") or settings.default_cwd

                session, task = await session_manager.start_turn(
                    prompt=prompt_text,
                    conversation_id=req_conv_id,
                    model=model,
                    effort=effort,
                    mode=mode,
                    cwd=cwd,
                )

                if session.conversation_id != current_conv_id:
                    web_channel.unregister_client(websocket, current_conv_id)
                    current_conv_id = session.conversation_id
                    web_channel.register_client(websocket, current_conv_id)

                await websocket.send_text(json.dumps({
                    "type": "prompt_ack",
                    "conversation_id": current_conv_id,
                    "status": "running",
                }))

    except WebSocketDisconnect:
        web_channel.unregister_client(websocket, current_conv_id)
    except Exception as e:
        print(f"WebSocket exception: {e}")
        web_channel.unregister_client(websocket, current_conv_id)


@ws_router.websocket("/ws/terminal")
@ws_router.websocket("/ws/terminal/{conversation_id}")
async def websocket_terminal_endpoint(websocket: WebSocket, conversation_id: Optional[str] = None):
    """
    Dedicated terminal follow WebSocket for resuming and streaming live CLI output per tab.
    """
    await websocket.accept()
    current_conv_id = conversation_id
    web_channel.register_client(websocket, current_conv_id)

    if current_conv_id:
        try:
            state = session_manager.get_session_state(current_conv_id, last_seq=0)
            await websocket.send_text(json.dumps({
                "type": "terminal_snapshot",
                "conversation_id": current_conv_id,
                "status": state.get("status", "idle"),
                "is_generating": state.get("is_generating", False),
                "lines": state.get("terminal_logs", []),
                "last_seq": state.get("last_seq", 0),
            }))
        except Exception as e:
            print(f"Error sending terminal snapshot: {e}")

    try:
        while True:
            raw_text = await websocket.receive_text()
            if not raw_text:
                continue

            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            if msg_type in ("subscribe", "resume", "switch_conversation"):
                target_conv_id = data.get("conversation_id")
                last_seq = int(data.get("last_seq", 0))

                if target_conv_id and target_conv_id != current_conv_id:
                    web_channel.unregister_client(websocket, current_conv_id)
                    current_conv_id = target_conv_id
                    web_channel.register_client(websocket, current_conv_id)

                if current_conv_id:
                    state = session_manager.get_session_state(current_conv_id, last_seq=last_seq)
                    await websocket.send_text(json.dumps({
                        "type": "terminal_snapshot",
                        "conversation_id": current_conv_id,
                        "status": state.get("status", "idle"),
                        "is_generating": state.get("is_generating", False),
                        "lines": state.get("terminal_logs", []),
                        "last_seq": state.get("last_seq", 0),
                    }))
            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        web_channel.unregister_client(websocket, current_conv_id)
    except Exception as e:
        print(f"Terminal WebSocket exception: {e}")
        web_channel.unregister_client(websocket, current_conv_id)
