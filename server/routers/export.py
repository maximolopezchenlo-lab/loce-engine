"""REST endpoints for exporting recorded conference sessions into SRT, VTT, and TXT."""

from __future__ import annotations

import re
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from core.engine.base import SUPPORTED_LANGUAGES
from core.exporters.exporters import ExportFormat, SessionExporter

ROOM_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
ALLOWED_FORMATS = ("srt", "vtt", "txt")

router = APIRouter(prefix="/api/rooms/{room_id}/export", tags=["Exporters"])


@router.get("/{format_name}")
async def export_session_transcript(
    room_id: str,
    format_name: str,
    request: Request,
    lang: str = Query(default="es", description="Language of transcript to export"),
    include_speaker: bool = Query(default=True, description="Include speaker tags in export"),
):
    """Generate and download formatted subtitle or transcript file post-session."""
    # 1. Path traversal & injection validation
    if not ROOM_ID_REGEX.match(room_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid room_id '{room_id}'. Must match pattern ^[a-zA-Z0-9_-]{{1,64}}$",
        )

    format_lower = format_name.lower()
    if format_lower not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{format_name}'. Allowed formats: {ALLOWED_FORMATS}.",
        )

    if lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language '{lang}'. Allowed: {SUPPORTED_LANGUAGES}.",
        )

    room_service = request.app.state.room_service
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")

    export_fmt = ExportFormat(format_lower)

    content = SessionExporter.export(
        events=room.history,
        fmt=export_fmt,
        target_language=lang,
        include_speaker=include_speaker,
    )

    mime_map = {
        ExportFormat.SRT: "application/x-subrip; charset=utf-8",
        ExportFormat.VTT: "text/vtt; charset=utf-8",
        ExportFormat.TXT: "text/plain; charset=utf-8",
    }
    media_type = mime_map.get(export_fmt, "text/plain; charset=utf-8")
    filename = f"{room_id}_{lang}.{export_fmt.value}"

    return Response(
        content=content.encode("utf-8"),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

