"""LiveVoice Open-Caption Engine (LOCE) Main FastAPI Application."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from core.glossary.glossary import GlossaryEngine
from server.pubsub.broker import PubSubBroker
from server.routers import export, ingest_ws, rooms, sse, stream_ws
from server.services.room_service import RoomService

# Load environment configuration
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("loce.server")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for state management and graceful shutdown."""
    logger.info("Initializing LiveVoice Open-Caption Engine (LOCE)...")

    # 1. Instantiate core shared singletons
    redis_url = os.getenv("REDIS_URL", "")
    pubsub_broker = PubSubBroker(redis_url=redis_url)
    await pubsub_broker.initialize()
    glossary_engine = GlossaryEngine()

    default_provider = os.getenv("DEFAULT_PROVIDER", "gemini").lower()
    if default_provider == "gemini" and not os.getenv("GEMINI_API_KEY"):
        logger.warning(
            "GEMINI_API_KEY is not set. Defaulting provider to 'mock' for local offline testing."
        )
        default_provider = "mock"


    room_service = RoomService(
        pubsub_broker=pubsub_broker,
        glossary_engine=glossary_engine,
        default_provider=default_provider,
    )

    # Pre-seed default conference rooms
    await room_service.get_or_create_room("main-stage", name="Main Auditorium")
    await room_service.get_or_create_room("track-1", name="Engineering Track")
    await room_service.get_or_create_room("track-2", name="AI & Systems Track")

    # Attach to app.state
    app.state.pubsub_broker = pubsub_broker
    app.state.glossary_engine = glossary_engine
    app.state.room_service = room_service

    logger.info("LOCE initialized successfully. Ready for audio ingestion.")
    yield

    # Shutdown sequence: stop all rooms and pubsub
    logger.info("Shutting down LOCE sessions...")
    for room_info in room_service.list_rooms():
        await room_service.stop_room(room_info["room_id"])
    await pubsub_broker.close()
    logger.info("LOCE shutdown complete.")


app = FastAPI(
    title="LiveVoice Open-Caption Engine (LOCE)",
    description="Ultra-low latency distributed real-time audio transcription and simultaneous translation",
    version="1.0.0",
    lifespan=lifespan,
)

# Broadcast and web origin CORS policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(ingest_ws.router)
app.include_router(stream_ws.router)
app.include_router(rooms.router)
app.include_router(export.router)
app.include_router(sse.router)


@app.get("/healthz")
async def health_check():
    """Liveness probe for container orchestrators."""
    return {
        "status": "healthy",
        "service": "LOCE",
        "version": "1.0.0",
    }


# Static fixtures endpoint with strict path traversal confinement
fixtures_dir = Path(__file__).resolve().parent.parent / "fixtures"


@app.get("/fixtures/{filename:path}")
async def serve_fixture(filename: str):
    """Serve fixture audio files safely confined within fixtures/ directory."""
    base_dir = fixtures_dir.resolve()
    target_path = (base_dir / filename).resolve()
    try:
        if os.path.commonpath([str(base_dir), str(target_path)]) != str(base_dir):
            raise HTTPException(status_code=400, detail="Path traversal detected")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not target_path.is_file():
        raise HTTPException(status_code=404, detail="Fixture not found")

    return FileResponse(target_path)


# Static frontend files mounting if built
web_dist = Path(__file__).resolve().parent.parent / "web" / "dist"
if web_dist.exists() and (web_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(web_dist / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)

    async def serve_spa(full_path: str):
        file_path = web_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(web_dist / "index.html")
