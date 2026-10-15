from __future__ import annotations
import asyncio
import json
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.engine import engine
from app.channels.web import web_channel
from app.config import settings
from app.processes import process_manager

ws_router = APIRouter()


@ws_router.websocket("/ws/chat")
@ws_router.websocket("/ws/chat/{conversation_id}")
async def websocket_chat_endpoint(websocket: WebSocket, conversation_id: Optional[str] = None):
    await websocket.accept()
    current_conv_id = conversation_id
    web_channel.register_client(websocket, current_conv_id)

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

            if msg_type == "abort":
                if current_conv_id:
                    aborted = await engine.abort(current_conv_id)
                    await websocket.send_text(json.dumps({
                        "type": "aborted",
                        "conversation_id": current_conv_id,
                        "success": aborted
                    }))
                continue

            if msg_type == "btw":
                # Steering instruction injected by user
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

                try:
                    async for event in engine.execute_turn(
                        prompt=prompt_text,
                        conversation_id=req_conv_id,
                        model=model,
                        effort=effort,
                        mode=mode,
                        cwd=cwd,
                    ):
                        ev_type = event.get("event")

                        if ev_type == "init":
                            new_conv_id = event.get("conversation_id")
                            if new_conv_id and new_conv_id != current_conv_id:
                                # Re-register with new conversation ID
                                web_channel.unregister_client(websocket, current_conv_id)
                                current_conv_id = new_conv_id
                                web_channel.register_client(websocket, current_conv_id)

                            await websocket.send_text(json.dumps({
                                "type": "init",
                                "conversation_id": current_conv_id,
                                "model": model,
                                "tools": event.get("init", {}).get("tools", []),
                            }))

                        elif ev_type == "cli_log":
                            await websocket.send_text(json.dumps({
                                "type": "cli_log",
                                "conversation_id": current_conv_id,
                                "stream": event.get("stream", "stdout"),
                                "level": event.get("level", "info"),
                                "message": event.get("message", ""),
                                "timestamp": event.get("timestamp"),
                            }))

                        elif ev_type == "agent_response":
                            await websocket.send_text(json.dumps({
                                "type": "token",
                                "conversation_id": current_conv_id,
                                "delta": event.get("delta", ""),
                                "state": event.get("state"),
                                "step_index": event.get("step_index"),
                                "duration_seconds": event.get("duration_seconds"),
                                "usage": event.get("usage"),
                            }))

                        elif ev_type == "tool":
                            await websocket.send_text(json.dumps({
                                "type": "tool",
                                "conversation_id": current_conv_id,
                                "step_index": event.get("step_index"),
                                "tool_name": event.get("tool_name"),
                                "tool_info": event.get("tool_info"),
                                "summary": event.get("summary"),
                                "state": event.get("state"),
                                "duration_seconds": event.get("duration_seconds"),
                            }))

                        elif ev_type == "result":
                            res_conv_id = event.get("conversation_id") or current_conv_id
                            await websocket.send_text(json.dumps({
                                "type": "result",
                                "conversation_id": res_conv_id,
                                "status": event.get("status"),
                                "response": event.get("response"),
                                "error": event.get("error"),
                                "duration_seconds": event.get("duration_seconds"),
                                "num_turns": event.get("num_turns"),
                                "usage": event.get("usage"),
                            }))

                        elif ev_type == "error":
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "conversation_id": current_conv_id,
                                "error": event.get("error"),
                            }))

                        elif ev_type == "warning":
                            await websocket.send_text(json.dumps({
                                "type": "warning",
                                "message": event.get("message"),
                            }))

                except asyncio.CancelledError:
                    await websocket.send_text(json.dumps({
                        "type": "aborted",
                        "conversation_id": current_conv_id,
                    }))
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "conversation_id": current_conv_id,
                        "error": str(e)
                    }))

    except WebSocketDisconnect:
        web_channel.unregister_client(websocket, current_conv_id)
    except Exception as e:
        print(f"WebSocket exception: {e}")
        web_channel.unregister_client(websocket, current_conv_id)
