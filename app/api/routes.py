from __future__ import annotations
import os
import shutil
import platform
import asyncio
import time
import re
import hmac
import secrets
import ipaddress
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Request, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.config import settings, save_settings
from app.engine import engine
from app.conversations import conv_manager
from app.channels.manager import channel_manager
from app.channels.web import web_channel
from app.channels.discord import discord_channel
from app.channels.telegram import telegram_channel
from app.channels.whatsapp import whatsapp_channel
from app.channels.imessage import imessage_channel
from app.channels.webhook import webhook_channel
from app.processes import process_manager
from app.cron.manager import cron_manager, validate_cron_expression
from app.cron.models import CronJobCreate, CronJobUpdate

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


class TelegramConfigRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable Telegram bot")
    token: Optional[str] = Field(None, description="Telegram Bot Token")
    allowed_users: Optional[List[str]] = Field(None, description="Allowed usernames or user IDs")
    show_tools: Optional[bool] = Field(None, description="Show tool updates")


class WhatsAppConfigRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable WhatsApp channel")
    mode: Optional[str] = Field(None, description="Integration mode ('cloud_api' or 'gateway')")
    phone_number_id: Optional[str] = Field(None, description="Meta WhatsApp Phone Number ID")
    access_token: Optional[str] = Field(None, description="Meta WhatsApp Permanent Access Token")
    verify_token: Optional[str] = Field(None, description="Meta Webhook Verification Secret")
    gateway_url: Optional[str] = Field(None, description="Gateway endpoint URL")
    gateway_token: Optional[str] = Field(None, description="Gateway authentication token/API key")
    allowed_numbers: Optional[List[str]] = Field(None, description="Allowed sender phone numbers")
    show_tools: Optional[bool] = Field(None, description="Show tool updates")


class IMessageConfigRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable iMessage channel")
    server_url: Optional[str] = Field(None, description="BlueBubbles server base URL")
    password: Optional[str] = Field(None, description="BlueBubbles server password")
    allowed_senders: Optional[List[str]] = Field(None, description="Allowed Apple IDs or phone numbers")
    show_tools: Optional[bool] = Field(None, description="Show tool updates")


class WebhookConfigRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable generic webhook trigger")
    api_key: Optional[str] = Field(None, description="Secret API key / bearer token")
    require_auth: Optional[bool] = Field(None, description="Enforce API key authorization")
    allowed_ips: Optional[List[str]] = Field(None, description="Allowed client IP / CIDR list")


class WebhookTriggerRequest(BaseModel):
    prompt: str = Field(..., description="Prompt to execute")
    token: Optional[str] = Field(None, description="Optional API key / token passed in JSON body")
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
    from app.session_manager import session_manager
    aborted = await session_manager.abort_turn(conversation_id)
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


@router.post("/channels/telegram/config")
async def configure_telegram(req: TelegramConfigRequest):
    settings.telegram_enabled = req.enabled
    if req.token is not None and not ("..." in req.token or req.token == "***"):
        settings.telegram_bot_token = req.token.strip()
    if req.allowed_users is not None:
        settings.telegram_allowed_users = req.allowed_users
    if req.show_tools is not None:
        settings.telegram_show_tools = req.show_tools

    save_settings(settings)

    if settings.telegram_enabled and settings.telegram_bot_token:
        asyncio.create_task(telegram_channel.start())
    else:
        asyncio.create_task(telegram_channel.stop())

    return {
        "status": "ok",
        "channel": telegram_channel.get_status()
    }


@router.post("/channels/telegram/webhook")
async def handle_telegram_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    message = body.get("message")
    if message:
        asyncio.create_task(telegram_channel._process_message(message))
    return {"ok": True}


@router.post("/channels/whatsapp/config")
async def configure_whatsapp(req: WhatsAppConfigRequest):
    settings.whatsapp_enabled = req.enabled
    if req.mode is not None:
        settings.whatsapp_mode = req.mode
    if req.phone_number_id is not None:
        settings.whatsapp_phone_number_id = req.phone_number_id.strip()
    if req.access_token is not None and not ("..." in req.access_token or req.access_token == "***"):
        settings.whatsapp_access_token = req.access_token.strip()
    if req.verify_token is not None and not ("..." in req.verify_token or req.verify_token == "***"):
        settings.whatsapp_verify_token = req.verify_token.strip()
    if req.gateway_url is not None:
        settings.whatsapp_gateway_url = req.gateway_url.strip()
    if req.gateway_token is not None and not ("..." in req.gateway_token or req.gateway_token == "***"):
        settings.whatsapp_gateway_token = req.gateway_token.strip()
    if req.allowed_numbers is not None:
        settings.whatsapp_allowed_numbers = req.allowed_numbers
    if req.show_tools is not None:
        settings.whatsapp_show_tools = req.show_tools

    save_settings(settings)

    if settings.whatsapp_enabled:
        asyncio.create_task(whatsapp_channel.start())
    else:
        asyncio.create_task(whatsapp_channel.stop())

    return {
        "status": "ok",
        "channel": whatsapp_channel.get_status()
    }


@router.get("/channels/whatsapp/webhook")
async def verify_whatsapp_webhook(request: Request):
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    expected_token = getattr(settings, "whatsapp_verify_token", "agy-verify-secret")
    if mode == "subscribe" and token == expected_token:
        return PlainTextResponse(content=challenge or "")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/channels/whatsapp/webhook")
async def handle_whatsapp_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    res = await whatsapp_channel.handle_inbound_payload(body)
    return res


@router.post("/channels/imessage/config")
async def configure_imessage(req: IMessageConfigRequest):
    settings.imessage_enabled = req.enabled
    if req.server_url is not None:
        settings.imessage_server_url = req.server_url.strip()
    if req.password is not None and not ("..." in req.password or req.password == "***"):
        settings.imessage_password = req.password.strip()
    if req.allowed_senders is not None:
        settings.imessage_allowed_senders = req.allowed_senders
    if req.show_tools is not None:
        settings.imessage_show_tools = req.show_tools

    save_settings(settings)

    if settings.imessage_enabled:
        asyncio.create_task(imessage_channel.start())
    else:
        asyncio.create_task(imessage_channel.stop())

    return {
        "status": "ok",
        "channel": imessage_channel.get_status()
    }


@router.post("/channels/imessage/webhook")
async def handle_imessage_webhook(request: Request):
    expected_pw = getattr(settings, "imessage_password", "").strip()
    if expected_pw and getattr(settings, "imessage_enabled", False):
        pw = request.query_params.get("password") or request.headers.get("x-password") or ""
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            pw = auth[7:].strip()
        if pw and not hmac.compare_digest(pw, expected_pw):
            raise HTTPException(status_code=401, detail="Unauthorized: iMessage password mismatch")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    res = await imessage_channel.handle_inbound_payload(body)
    return res


def verify_webhook_authorization(request: Request, body_token: Optional[str] = None) -> None:
    """
    Validates inbound webhook authorization:
    1. Checks if webhook channel is enabled (403 Forbidden if disabled).
    2. Validates client IP against allowed IPs if configured (403 Forbidden).
    3. Checks authorization token (Bearer, X-API-Key, query param, or body token).
    """
    if not getattr(settings, "webhook_enabled", True):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Webhook trigger channel is disabled in server settings"
        )

    # IP whitelist check
    allowed_ips = getattr(settings, "webhook_allowed_ips", [])
    if allowed_ips:
        client_ip = request.client.host if request.client else ""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

        ip_matched = False
        for allowed in allowed_ips:
            try:
                if "/" in allowed:
                    if ipaddress.ip_address(client_ip) in ipaddress.ip_network(allowed, strict=False):
                        ip_matched = True
                        break
                elif client_ip == allowed:
                    ip_matched = True
                    break
            except Exception:
                if client_ip == allowed:
                    ip_matched = True
                    break
        if not ip_matched:
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: Client IP '{client_ip}' is not authorized to trigger webhooks"
            )

    if not getattr(settings, "webhook_require_auth", True):
        return

    expected_key = getattr(settings, "webhook_api_key", "").strip()
    if not expected_key:
        raise HTTPException(
            status_code=500,
            detail="Webhook authorization is enforced but no webhook API key is configured on server"
        )

    # Extract token from headers, query params, or body
    provided_key = None

    # 1. Authorization: Bearer <token> or Token <token>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        provided_key = auth_header[7:].strip()
    elif auth_header.startswith("Token "):
        provided_key = auth_header[6:].strip()

    # 2. X-API-Key or X-Webhook-Secret or X-Agy-Token
    if not provided_key:
        provided_key = (
            request.headers.get("X-API-Key")
            or request.headers.get("X-Webhook-Secret")
            or request.headers.get("X-Agy-Token")
            or request.headers.get("x-api-key")
        )

    # 3. Query param: ?token=... or ?api_key=...
    if not provided_key:
        provided_key = request.query_params.get("token") or request.query_params.get("api_key")

    # 4. JSON body token
    if not provided_key and body_token:
        provided_key = body_token.strip()

    if not provided_key:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Missing webhook API key. Provide via 'Authorization: Bearer <key>', 'X-API-Key: <key>' header, or '?token=<key>' parameter.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not hmac.compare_digest(provided_key, expected_key):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid webhook API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/channels/webhook/trigger")
async def trigger_webhook(
    request: Request,
    req: WebhookTriggerRequest,
    background_tasks: BackgroundTasks
):
    verify_webhook_authorization(request, body_token=req.token)

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


@router.post("/channels/webhook/config")
async def configure_webhook(req: WebhookConfigRequest):
    settings.webhook_enabled = req.enabled
    if req.require_auth is not None:
        settings.webhook_require_auth = req.require_auth
    if req.api_key is not None and not ("..." in req.api_key or req.api_key == "***"):
        clean_key = req.api_key.strip()
        if clean_key:
            settings.webhook_api_key = clean_key
    if req.allowed_ips is not None:
        settings.webhook_allowed_ips = [ip.strip() for ip in req.allowed_ips if ip.strip()]

    save_settings(settings)
    return {
        "status": "ok",
        "channel": webhook_channel.get_status()
    }


@router.get("/channels/webhook/key")
async def get_webhook_key():
    return {
        "api_key": getattr(settings, "webhook_api_key", ""),
        "enabled": getattr(settings, "webhook_enabled", True),
        "require_auth": getattr(settings, "webhook_require_auth", True),
        "allowed_ips": getattr(settings, "webhook_allowed_ips", []),
    }


@router.post("/channels/webhook/regenerate-token")
async def regenerate_webhook_token():
    new_token = f"agy_sec_{secrets.token_urlsafe(24)}"
    settings.webhook_api_key = new_token
    save_settings(settings)
    return {
        "status": "ok",
        "api_key": new_token,
        "channel": webhook_channel.get_status()
    }


# Settings
@router.get("/settings")
async def get_current_settings():
    safe_settings = settings.model_dump()
    
    def _apply_mask(key: str):
        val = safe_settings.get(key)
        if val:
            safe_settings[f"{key}_masked"] = val[:6] + "..." + val[-4:] if len(val) > 10 else "***"
            safe_settings[f"{key}_set"] = True
        else:
            safe_settings[f"{key}_masked"] = ""
            safe_settings[f"{key}_set"] = False

    for secret_key in [
        "discord_bot_token",
        "telegram_bot_token",
        "whatsapp_access_token",
        "whatsapp_gateway_token",
        "whatsapp_verify_token",
        "imessage_password",
        "webhook_api_key",
    ]:
        _apply_mask(secret_key)

    return safe_settings


@router.post("/settings")
async def update_settings(new_settings: Dict[str, Any]):
    secret_keys = {
        "discord_bot_token",
        "telegram_bot_token",
        "whatsapp_access_token",
        "whatsapp_gateway_token",
        "whatsapp_verify_token",
        "imessage_password",
        "webhook_api_key",
    }
    for k, v in new_settings.items():
        if hasattr(settings, k) and not k.startswith("_"):
            # Do not overwrite sensitive tokens with masked placeholders
            if k in secret_keys and ("..." in str(v) or v == "***"):
                continue
            setattr(settings, k, v)
    save_settings(settings)
    return {"status": "ok"}


# Branding
@router.get("/branding")
async def get_branding():
    return {
        "brand_prefix": settings.brand_prefix,
        "brand_name": settings.brand_name,
        "brand_badge": settings.brand_badge,
        "brand_title": settings.brand_title,
        "brand_tagline": settings.brand_tagline,
        "brand_accent_color": settings.brand_accent_color,
        "brand_accent_secondary": settings.brand_accent_secondary,
        "brand_logo_url": settings.brand_logo_url,
        "brand_favicon_url": settings.brand_favicon_url,
    }


@router.post("/branding")
async def update_branding(new_branding: Dict[str, Any]):
    allowed_keys = [
        "brand_prefix",
        "brand_name",
        "brand_badge",
        "brand_title",
        "brand_tagline",
        "brand_accent_color",
        "brand_accent_secondary",
        "brand_logo_url",
        "brand_favicon_url",
    ]
    for k in allowed_keys:
        if k in new_branding:
            setattr(settings, k, new_branding[k])
    save_settings(settings)
    return {"status": "ok", "branding": await get_branding()}


@router.post("/branding/logo")
async def upload_branding_logo(file: UploadFile = File(...)):
    if not file.content_type or not (
        file.content_type.startswith("image/") or file.filename.lower().endswith((".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"))
    ):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an SVG, PNG, WebP, or JPEG image.")

    ext = Path(file.filename).suffix if file.filename else ".png"
    if not ext:
        ext = ".png"

    STATIC_ASSETS_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "assets"
    STATIC_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    target_path = STATIC_ASSETS_DIR / f"custom-logo{ext}"

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo file size exceeds 5MB limit.")

    with open(target_path, "wb") as f:
        f.write(content)

    logo_url = f"/static/assets/custom-logo{ext}?v={int(time.time())}"
    settings.brand_logo_url = logo_url
    save_settings(settings)

    return {"status": "ok", "brand_logo_url": logo_url}


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


# ==============================================================================
# Cron & Scheduled Automation Endpoints
# ==============================================================================

class CronValidateRequest(BaseModel):
    cron_expression: str = Field(..., description="Cron expression to validate")


@router.get("/cron/jobs")
async def list_cron_jobs():
    """List all scheduled cron jobs with human-friendly descriptions and statuses."""
    return {"jobs": cron_manager.list_jobs()}


@router.post("/cron/jobs")
async def create_cron_job(payload: CronJobCreate):
    """Create a new scheduled cron job."""
    try:
        job = await cron_manager.create_job(payload)
        return {"success": True, "job": job}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create cron job: {e}")


@router.get("/cron/jobs/{job_id}")
async def get_cron_job(job_id: str):
    """Get details for a single cron job."""
    job = cron_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Cron job '{job_id}' not found")
    return {"job": job}


@router.put("/cron/jobs/{job_id}")
async def update_cron_job(job_id: str, payload: CronJobUpdate):
    """Update an existing cron job."""
    try:
        job = await cron_manager.update_job(job_id, payload)
        if not job:
            raise HTTPException(status_code=404, detail=f"Cron job '{job_id}' not found")
        return {"success": True, "job": job}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update cron job: {e}")


@router.delete("/cron/jobs/{job_id}")
async def delete_cron_job(job_id: str):
    """Delete a cron job."""
    deleted = await cron_manager.delete_job(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Cron job '{job_id}' not found")
    return {"success": True, "deleted_id": job_id}


@router.post("/cron/jobs/{job_id}/toggle")
async def toggle_cron_job(job_id: str):
    """Toggle a cron job between enabled and disabled."""
    job = await cron_manager.toggle_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Cron job '{job_id}' not found")
    return {"success": True, "job": job}


@router.post("/cron/jobs/{job_id}/run")
async def run_cron_job_now(job_id: str, background_tasks: BackgroundTasks):
    """Manually trigger immediate execution of a cron job in the background."""
    job = cron_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Cron job '{job_id}' not found")

    if job.get("is_running"):
        return {"success": False, "message": f"Job '{job['name']}' is already running", "job": job}

    # Trigger execution in background task
    background_tasks.add_task(cron_manager.execute_job, job_id, True)
    return {"success": True, "message": f"Triggered execution for '{job['name']}'", "job_id": job_id}


@router.get("/cron/jobs/{job_id}/runs")
async def get_cron_job_runs(job_id: str, limit: int = 50):
    """Get past execution history runs for a specific job."""
    runs = cron_manager.list_runs(job_id=job_id, limit=limit)
    return {"runs": runs, "job_id": job_id}


@router.get("/cron/runs")
async def list_recent_cron_runs(limit: int = 50):
    """Get past execution history runs across all scheduled jobs."""
    runs = cron_manager.list_runs(limit=limit)
    return {"runs": runs}


@router.post("/cron/validate")
async def validate_cron(payload: CronValidateRequest):
    """Validate a cron expression and return human explanation plus next 5 run times."""
    valid, desc, next_timestamps = validate_cron_expression(payload.cron_expression)
    next_runs_iso = [
        datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        for ts in next_timestamps
    ]
    return {
        "valid": valid,
        "description": desc,
        "next_timestamps": next_timestamps,
        "next_runs": next_runs_iso,
    }

