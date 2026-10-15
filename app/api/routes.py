from __future__ import annotations
import os
import shutil
import platform
import asyncio
import time
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from app.config import settings, save_settings
from app.engine import engine
from app.conversations import conv_manager
from app.channels.manager import channel_manager
from app.channels.web import web_channel
from app.channels.discord import discord_channel
from app.channels.webhook import webhook_channel
from app.processes import process_manager

router = APIRouter()


class ChatRequest(BaseModel):
    prompt: str = Field(..., description="User prompt text")
    conversation_id: Optional[str] = Field(None, description="Conversation ID to resume")
    model: Optional[str] = Field(None, description="Model ID")
    effort: Optional[str] = Field(None, description="Reasoning effort")
    mode: Optional[str] = Field(None, description="Agent mode")
    cwd: Optional[str] = Field(None, description="Working directory")


class DiscordConfigRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable Discord bot")
    token: Optional[str] = Field(None, description="Discord Bot Token")
    prefix: Optional[str] = Field(None, description="Command prefix")
    allowed_channels: Optional[List[str]] = Field(None, description="List of allowed channel IDs")
    allowed_guilds: Optional[List[str]] = Field(None, description="List of allowed guild IDs")
    auto_thread: Optional[bool] = Field(None, description="Auto thread")
    show_tools: Optional[bool] = Field(None, description="Show tool updates")


class WebhookTriggerRequest(BaseModel):
    prompt: str = Field(..., description="Prompt to execute")
    conversation_id: Optional[str] = Field(None, description="Optional conversation ID")
    callback_url: Optional[str] = Field(None, description="URL to POST result to when completed")
    model: Optional[str] = Field(None, description="Optional model ID")


class BtwRequest(BaseModel):
    conversation_id: str = Field(..., description="Target conversation ID")
    message: str = Field(..., description="Steering message or hint for the model")
    interrupt: bool = Field(default=False, description="Whether to interrupt current step to steer immediately")


class StopProcessRequest(BaseModel):
    force: bool = Field(default=False, description="Send SIGKILL instead of SIGINT")


# Conversations
@router.get("/conversations")
async def list_conversations(limit: int = 50):
    return conv_manager.list_conversations(limit=limit)


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    history = conv_manager.get_conversation_history(conversation_id)
    if not history:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return history


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    success = conv_manager.delete_conversation(conversation_id)
    return {"status": "ok" if success else "error"}


# Models
@router.get("/models")
async def list_models():
    return await engine.get_available_models()


# Synchronous Chat Turn (HTTP endpoint)
@router.post("/chat")
async def send_chat(req: ChatRequest):
    final_result = None
    captured_conv_id = req.conversation_id
    full_text = ""

    async for event in engine.execute_turn(
        prompt=req.prompt,
        conversation_id=req.conversation_id,
        model=req.model,
        effort=req.effort,
        mode=req.mode,
        cwd=req.cwd,
    ):
        ev_type = event.get("event")
        if ev_type == "init":
            captured_conv_id = event.get("conversation_id")
        elif ev_type == "agent_response":
            full_text += event.get("delta", "")
        elif ev_type == "result":
            final_result = event
        elif ev_type == "error":
            raise HTTPException(status_code=500, detail=event.get("error", "Error in agy execution"))

    if not final_result:
        final_result = {
            "conversation_id": captured_conv_id,
            "status": "SUCCESS",
            "response": full_text,
        }

    return final_result


# Abort turn
@router.post("/abort/{conversation_id}")
async def abort_conversation(conversation_id: str):
    aborted = await engine.abort(conversation_id)
    return {"status": "ok" if aborted else "not_running"}


# Process Management & Attachment
@router.get("/processes")
async def list_processes():
    return process_manager.list_processes()


@router.get("/processes/{pid}/output")
async def get_process_output(pid: int, limit: int = 150):
    return process_manager.get_process_output(pid=pid, limit=limit)


@router.post("/processes/{pid}/stop")
async def stop_process(pid: int, req: Optional[StopProcessRequest] = None):
    force = req.force if req else False
    res = process_manager.stop_process(pid=pid, force=force)
    return res


@router.post("/processes/btw")
async def inject_btw(req: BtwRequest):
    res = process_manager.inject_steering(
        conversation_id=req.conversation_id,
        message=req.message,
        interrupt=req.interrupt,
    )
    # Broadcast to web channel so connected UI clients see the steering event
    await web_channel.broadcast(req.conversation_id, {
        "event": "btw_injected",
        "conversation_id": req.conversation_id,
        "message": req.message,
        "interrupted": res.get("interrupted", False),
        "timestamp": time.time(),
    })
    return res


# Channels & Integrations
@router.get("/channels")
async def get_channels_status():
    return channel_manager.list_channels()


@router.post("/channels/discord/config")
async def configure_discord(req: DiscordConfigRequest):
    settings.discord_enabled = req.enabled
    if req.token is not None:
        settings.discord_bot_token = req.token.strip()
    if req.prefix is not None:
        settings.discord_prefix = req.prefix.strip()
    if req.allowed_channels is not None:
        settings.discord_allowed_channels = req.allowed_channels
    if req.allowed_guilds is not None:
        settings.discord_allowed_guilds = req.allowed_guilds
    if req.auto_thread is not None:
        settings.discord_auto_thread = req.auto_thread
    if req.show_tools is not None:
        settings.discord_show_tools = req.show_tools

    save_settings(settings)

    # Restart or stop bot
    if settings.discord_enabled and settings.discord_bot_token:
        asyncio.create_task(discord_channel.start())
    else:
        asyncio.create_task(discord_channel.stop())

    return {
        "status": "ok",
        "channel": discord_channel.get_status()
    }


@router.post("/channels/webhook/trigger")
async def trigger_webhook(req: WebhookTriggerRequest, background_tasks: BackgroundTasks):
    async def run_and_callback():
        final_res = {}
        async for ev in engine.execute_turn(
            prompt=req.prompt,
            conversation_id=req.conversation_id,
            model=req.model,
        ):
            if ev.get("event") == "result":
                final_res = ev

        if req.callback_url:
            await webhook_channel.send_callback(req.callback_url, final_res)

    background_tasks.add_task(run_and_callback)
    return {"status": "accepted", "message": "Execution started in background"}


# Settings
@router.get("/settings")
async def get_current_settings():
    safe_settings = settings.model_dump()
    # Mask token for security
    if safe_settings.get("discord_bot_token"):
        tok = safe_settings["discord_bot_token"]
        safe_settings["discord_bot_token_masked"] = tok[:6] + "..." + tok[-4:] if len(tok) > 10 else "***"
        safe_settings["discord_bot_token_set"] = True
    else:
        safe_settings["discord_bot_token_masked"] = ""
        safe_settings["discord_bot_token_set"] = False
    return safe_settings


@router.post("/settings")
async def update_settings(new_settings: Dict[str, Any]):
    for k, v in new_settings.items():
        if hasattr(settings, k) and not k.startswith("_"):
            # Do not overwrite token with masked version
            if k == "discord_bot_token" and ("..." in str(v) or v == "***"):
                continue
            setattr(settings, k, v)
    save_settings(settings)
    return {"status": "ok"}


_last_cpu_idle: float = 0.0
_last_cpu_total: float = 0.0


def _get_cpu_percent() -> float:
    global _last_cpu_idle, _last_cpu_total
    try:
        with open("/proc/stat", "r") as f:
            line = f.readline()
        vals = [float(x) for x in line.split()[1:]]
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0.0)
        total = sum(vals)

        if _last_cpu_total > 0:
            delta_total = total - _last_cpu_total
            delta_idle = idle - _last_cpu_idle
            pct = round(100.0 * (1.0 - (delta_idle / delta_total)), 1) if delta_total > 0 else 0.0
        else:
            import time
            time.sleep(0.04)
            with open("/proc/stat", "r") as f:
                line = f.readline()
            vals2 = [float(x) for x in line.split()[1:]]
            idle2 = vals2[3] + (vals2[4] if len(vals2) > 4 else 0.0)
            total2 = sum(vals2)
            delta_total = total2 - total
            delta_idle = idle2 - idle
            pct = round(100.0 * (1.0 - (delta_idle / delta_total)), 1) if delta_total > 0 else 0.0
            total = total2
            idle = idle2

        _last_cpu_idle = idle
        _last_cpu_total = total
        return max(0.0, min(100.0, pct))
    except Exception:
        return 0.0


# System & LXC Information
@router.get("/system")
async def get_system_info():
    total, used, free = shutil.disk_usage("/")
    disk_pct = round((used / total) * 100, 1) if total > 0 else 0.0

    mem_raw: Dict[str, int] = {}
    try:
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    mem_raw[parts[0].strip()] = int(parts[1].strip().split()[0])
    except Exception:
        pass

    total_kb = mem_raw.get("MemTotal", 1)
    avail_kb = mem_raw.get("MemAvailable", mem_raw.get("MemFree", 0))
    used_kb = max(0, total_kb - avail_kb)
    mem_pct = round((used_kb / total_kb) * 100, 1)

    try:
        load1, load5, load15 = os.getloadavg()
    except Exception:
        load1, load5, load15 = 0.0, 0.0, 0.0

    cpu_pct = _get_cpu_percent()

    return {
        "os": platform.platform(),
        "python": platform.python_version(),
        "cores": os.cpu_count() or 1,
        "cpu": {
            "percent": cpu_pct,
            "load_1m": round(load1, 2),
            "load_5m": round(load5, 2),
            "load_15m": round(load15, 2),
        },
        "disk": {
            "percent": disk_pct,
            "total_gb": round(total / (1024**3), 2),
            "used_gb": round(used / (1024**3), 2),
            "free_gb": round(free / (1024**3), 2),
        },
        "memory": {
            "percent": mem_pct,
            "total_mb": round(total_kb / 1024, 1),
            "used_mb": round(used_kb / 1024, 1),
            "available_mb": round(avail_kb / 1024, 1),
            "MemTotal": f"{total_kb // 1024} MB",
            "MemAvailable": f"{avail_kb // 1024} MB",
        },
        "agy_bin": settings.agy_bin,
    }


_last_quota_cache: Dict[str, Any] = {}
_last_quota_time: float = 0.0


async def _fetch_quota_async(force_refresh: bool = False) -> Dict[str, Any]:
    global _last_quota_cache, _last_quota_time
    now = time.time()
    if not force_refresh and _last_quota_cache and (now - _last_quota_time) < 45.0:
        return _last_quota_cache

    try:
        proc = await asyncio.create_subprocess_exec(
            settings.agy_bin, "-p", "/usage",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=12.0)
        out_text = stdout.decode("utf-8", errors="ignore")

        parsed: Dict[str, Any] = {
            "gemini_5h_percent": None,
            "gemini_5h_reset": "",
            "gemini_weekly_percent": None,
            "gemini_weekly_reset": "",
            "claude_gpt_5h_percent": None,
            "claude_gpt_weekly_percent": None,
            "details": [],
            "raw": out_text.strip(),
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        }

        for line in out_text.splitlines():
            m = re.search(r'([A-Za-z0-9 ]+?)\s+(Weekly Limit Remaining|Five Hour Limit Remaining)\s+(\d+)%\s+(.*)', line)
            if m:
                group, limit_type, pct_str, reset = m.groups()
                pct = int(pct_str)
                item = {
                    "group": group.strip(),
                    "type": limit_type.strip(),
                    "percent": pct,
                    "reset": reset.strip(),
                }
                parsed["details"].append(item)
                if "Gemini" in group:
                    if "Five Hour" in limit_type:
                        parsed["gemini_5h_percent"] = pct
                        parsed["gemini_5h_reset"] = reset.strip()
                    elif "Weekly" in limit_type:
                        parsed["gemini_weekly_percent"] = pct
                        parsed["gemini_weekly_reset"] = reset.strip()
                elif "Claude" in group:
                    if "Five Hour" in limit_type:
                        parsed["claude_gpt_5h_percent"] = pct
                    elif "Weekly" in limit_type:
                        parsed["claude_gpt_weekly_percent"] = pct

        if parsed["details"]:
            _last_quota_cache = parsed
            _last_quota_time = now
            return parsed
        elif _last_quota_cache:
            return _last_quota_cache
        return parsed
    except Exception as e:
        if _last_quota_cache:
            return _last_quota_cache
        return {
            "gemini_5h_percent": None,
            "gemini_weekly_percent": None,
            "details": [],
            "error": str(e),
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        }


@router.get("/quota")
async def get_quota_info(refresh: bool = False):
    return await _fetch_quota_async(force_refresh=refresh)
