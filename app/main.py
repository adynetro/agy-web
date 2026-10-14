from __future__ import annotations
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.api.websocket import ws_router
from app.channels.manager import channel_manager
from app.config import settings

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start channel listeners (Discord bot, etc.)
    print(f"Starting Agy WebUI on http://{settings.host}:{settings.port}")
    await channel_manager.start_all()
    yield
    # Shutdown: Stop all channels
    print("Shutting down Agy WebUI channels...")
    await channel_manager.stop_all()


app = FastAPI(
    title="Antigravity Web UI & Gateway",
    description="Extensible Web UI and messaging bridge for Google Antigravity (agy)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(api_router, prefix="/api")
app.include_router(ws_router)

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    return FileResponse(index_file)


@app.get("/favicon.ico")
@app.get("/apple-touch-icon.png")
@app.get("/apple-touch-icon-precomposed.png")
async def serve_favicon():
    favicon_file = STATIC_DIR / "assets" / "favicon.svg"
    return FileResponse(favicon_file, media_type="image/svg+xml")


def cli():
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Antigravity (agy) Web UI & Messaging Gateway")
    parser.add_argument("--host", default=settings.host, help=f"Host to bind (default: {settings.host})")
    parser.add_argument("--port", type=int, default=settings.port, help=f"Port to bind (default: {settings.port})")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    args = parser.parse_args()

    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    cli()
