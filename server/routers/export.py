"""REST endpoints for exporting recorded conference sessions into SRT, VTT, and TXT."""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, Response

from core.exporters.exporters import ExportFormat, SessionExporter

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
    room_service = request.app.state.room_service
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")

    format_lower = format_name.lower()
    try:
        export_fmt = ExportFormat(format_lower)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{format_name}'. Allowed: 'srt', 'vtt', 'txt'.",
        )

    content = SessionExporter.export(
        events=room.history,
        fmt=export_fmt,
        target_language=lang,
        include_speaker=include_speaker,
    )

    mime_map = {
        ExportFormat.SRT: "application/x-subrip",
        ExportFormat.VTT: "text/vtt",
        ExportFormat.TXT: "text/plain; charset=utf-8",
    }
    media_type = mime_map.get(export_fmt, "text/plain")
    filename = f"{room_id}_{lang}.{export_fmt.value}"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
