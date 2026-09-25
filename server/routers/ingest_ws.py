"""WebSocket endpoint for ingesting live audio streams per room."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

logger = logging.getLogger("loce.ingest_ws")

ROOM_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
MAX_AUDIO_CHUNK_BYTES = 64 * 1024  # 64 KB max per chunk (10x 200ms frame)

router = APIRouter()


@router.websocket("/ws/ingest/{room_id}")
@router.websocket("/api/rooms/{room_id}/ingest")
async def websocket_audio_ingest(
    websocket: WebSocket,
    room_id: str,
    sample_rate: int = 16000,
    channels: int = 1,
    api_key: Optional[str] = Query(default=None),
    provider: Optional[str] = Query(default=None),
) -> None:
    """Ingest live PCM audio frames from speakers, OBS, or mock runners."""
    # 1. Path traversal & injection validation
    if not ROOM_ID_REGEX.match(room_id):
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid room_id")
        return

    await websocket.accept()

    # Access room_service via app state
    room_service = websocket.app.state.room_service
    await room_service.get_or_create_room(
        room_id,
        provider_type=provider,
        gemini_api_key=api_key,
    )

    logger.info(
        f"Audio ingest client connected to room '{room_id}' (rate={sample_rate}, channels={channels}, provider={provider}, has_key={bool(api_key)})"
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
                # 2. DoS prevention: enforce message size threshold
                if len(data) > MAX_AUDIO_CHUNK_BYTES:
                    logger.warning(
                        f"Chunk size {len(data)} exceeds {MAX_AUDIO_CHUNK_BYTES} bytes. Closing WS 1009."
                    )
                    await websocket.close(
                        code=status.WS_1009_MESSAGE_TOO_BIG,
                        reason=f"Audio chunk exceeds {MAX_AUDIO_CHUNK_BYTES} bytes limit",
                    )
                    break

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
                        new_api_key = payload.get("api_key")
                        new_provider = payload.get("provider")
                        if new_api_key or new_provider:
                            await room_service.configure_room_provider(
                                room_id,
                                provider_type=new_provider,
                                gemini_api_key=new_api_key,
                            )
                        await websocket.send_json({"type": "config_ack", "status": "config_updated"})
                    elif payload.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except json.JSONDecodeError:
                    pass

    except (WebSocketDisconnect, asyncio.CancelledError):
        logger.info(f"Audio ingest client disconnected from room '{room_id}' after {frames_received} frames.")
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
    finally:
        logger.debug(f"Cleaned up audio ingest session for room '{room_id}' (received {frames_received} frames).")
