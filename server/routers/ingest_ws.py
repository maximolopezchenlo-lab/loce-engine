"""WebSocket endpoint for ingesting live audio streams per room."""

from __future__ import annotations

import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

logger = logging.getLogger("loce.ingest_ws")

router = APIRouter()


@router.websocket("/ws/ingest/{room_id}")
async def websocket_audio_ingest(
    websocket: WebSocket,
    room_id: str,
    sample_rate: int = 16000,
    channels: int = 1,
) -> None:
    """Ingest live PCM audio frames from speakers, OBS, or mock runners."""
    await websocket.accept()

    # Access room_service via app state
    room_service = websocket.app.state.room_service
    await room_service.get_or_create_room(room_id)

    logger.info(
        f"Audio ingest client connected to room '{room_id}' (rate={sample_rate}, channels={channels})"
    )

    current_sample_rate = sample_rate
    current_channels = channels
    frames_received = 0

    try:
        while True:
            message = await websocket.receive()

            # Handle binary PCM audio data
            if "bytes" in message and message["bytes"]:
                data = message["bytes"]
                frames_received += 1
                await room_service.ingest_audio(
                    room_id=room_id,
                    data=data,
                    sample_rate=current_sample_rate,
                    channels=current_channels,
                )

            # Handle JSON control frames (e.g. dynamic config update or ping)
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    if payload.get("type") == "config":
                        current_sample_rate = payload.get("sample_rate", current_sample_rate)
                        current_channels = payload.get("channels", current_channels)
                        await websocket.send_json({"status": "config_updated"})
                    elif payload.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except json.JSONDecodeError:
                    pass

    except Exception as e:
        err_msg = str(e).lower()
        if "disconnect" in err_msg or "closed" in err_msg or isinstance(e, WebSocketDisconnect):
            logger.info(f"Audio ingest client disconnected from room '{room_id}' after {frames_received} frames.")
        else:
            logger.error(f"Error in audio ingest WebSocket for room '{room_id}': {e}", exc_info=True)
            try:
                await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
            except Exception:
                pass
