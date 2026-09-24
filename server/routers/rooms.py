"""REST endpoints for managing conference rooms, sessions and glossaries."""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from core.engine.base import SUPPORTED_LANGUAGES
from core.glossary.glossary import TechnicalGlossary

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])


class CreateRoomRequest(BaseModel):
    room_id: str = Field(..., min_length=2, max_length=50)
    name: Optional[str] = None
    source_language: str = "en"
    target_languages: list[str] = Field(default_factory=lambda: list(SUPPORTED_LANGUAGES))
    provider_type: Optional[str] = None


class UpdateGlossaryRequest(BaseModel):
    terms: list[str] = Field(default_factory=list)
    speakers: list[str] = Field(default_factory=list)
    replacements: dict[str, str] = Field(default_factory=dict)


@router.get("")
async def list_rooms(request: Request):
    """Retrieve all known rooms and real-time operational metrics."""
    room_service = request.app.state.room_service
    return {"rooms": room_service.list_rooms()}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_room(payload: CreateRoomRequest, request: Request):
    """Create or initialize a conference room."""
    room_service = request.app.state.room_service
    room = await room_service.get_or_create_room(
        room_id=payload.room_id,
        name=payload.name,
        source_language=payload.source_language,
        target_languages=payload.target_languages,
        provider_type=payload.provider_type,
    )
    return {
        "status": "created",
        "room_id": room.room_id,
        "name": room.name,
        "provider_type": room.provider_type,
    }


@router.get("/{room_id}")
async def get_room(room_id: str, request: Request):
    """Get metadata, metrics, and recorded history for a specific room."""
    room_service = request.app.state.room_service
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")

    return {
        "room_id": room.room_id,
        "name": room.name,
        "status": room.status.value,
        "source_language": room.source_language,
        "target_languages": room.target_languages,
        "provider_type": room.provider_type,
        "is_healthy": room.provider.is_healthy,
        "subscribers": request.app.state.pubsub_broker.get_subscriber_count(room_id),
        "history_count": len(room.history),
        "metrics": {
            "total_bytes": room.metrics.total_bytes,
            "total_chunks": room.metrics.total_chunks,
            "partial_captions": room.metrics.partial_captions,
            "final_captions": room.metrics.final_captions,
            "avg_latency_ms": round(room.metrics.avg_latency_ms, 1),
            "p95_latency_ms": round(room.metrics.p95_latency_ms, 1),
        },
    }


@router.post("/{room_id}/start")
async def start_room(room_id: str, request: Request):
    """Start or resume transcription pipeline for room."""
    room_service = request.app.state.room_service
    room = room_service.get_room(room_id)
    if not room:
        room = await room_service.get_or_create_room(room_id)
    await room_service.start_room(room_id)
    return {"status": "started", "room_id": room_id}


@router.post("/{room_id}/stop")
async def stop_room(room_id: str, request: Request):
    """Stop transcription pipeline for room."""
    room_service = request.app.state.room_service
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")
    await room_service.stop_room(room_id)
    return {"status": "stopped", "room_id": room_id}


@router.get("/{room_id}/glossary")
async def get_glossary(room_id: str, request: Request):
    """Retrieve technical glossary and registered speakers for room."""
    glossary_engine = request.app.state.glossary_engine
    glossary = glossary_engine.get_room_glossary(room_id)
    return glossary.model_dump()


@router.post("/{room_id}/glossary")
async def update_glossary(room_id: str, payload: UpdateGlossaryRequest, request: Request):
    """Update custom terms, speaker names, and regex replacements for room."""
    glossary_engine = request.app.state.glossary_engine
    glossary = TechnicalGlossary(
        room_id=room_id,
        terms=payload.terms,
        speakers=payload.speakers,
        replacements=payload.replacements,
    )
    glossary_engine.register_room_glossary(glossary)
    return {"status": "updated", "room_id": room_id, "terms_count": len(payload.terms)}
