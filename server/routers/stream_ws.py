"""WebSocket endpoint for distributing live captions to Audience and OBS overlays."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from typing import Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from core.engine.base import SUPPORTED_LANGUAGES

logger = logging.getLogger("loce.stream_ws")

ROOM_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

router = APIRouter()


@router.websocket("/ws/stream/{room_id}")
async def websocket_caption_stream(
    websocket: WebSocket,
    room_id: str,
    lang: Optional[str] = Query(default=None, description="Target language filter (e.g. 'es', 'en')"),
    mode: str = Query(default="all", description="'all' (partials + finals) or 'final'"),
    api_key: Optional[str] = Query(default=None, description="Optional runtime Gemini API key"),
    provider: Optional[str] = Query(default=None, description="Optional provider override"),
) -> None:
    """Stream live caption events to web clients and broadcast overlays with low latency."""
    # 1. Path traversal & injection validation
    if not ROOM_ID_REGEX.match(room_id):
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid room_id")
        return

    # 2. Language filter validation
    if lang is not None and lang not in SUPPORTED_LANGUAGES:
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid lang")
        return

    await websocket.accept()

    room_service = websocket.app.state.room_service
    pubsub_broker = websocket.app.state.pubsub_broker

    room = await room_service.get_or_create_room(
        room_id,
        provider_type=provider,
        gemini_api_key=api_key,
    )
    subscriber_id = f"sub-{uuid.uuid4().hex[:8]}"

    # Subscribe to broker
    subscriber = await pubsub_broker.subscribe(
        subscriber_id=subscriber_id,
        room_id=room_id,
        target_language=lang,
    )

    try:
        # 1. Send initial session snapshot (recent final captions and latest active partial)
        recent_history = [
            e.model_dump() for e in room.history[-10:]
            if not lang or e.target_language == lang
        ]

        active_partial = None
        if lang and lang in room.latest_partials:
            active_partial = room.latest_partials[lang].model_dump()
        elif not lang and room.latest_partials:
            # Send first available partial
            first_key = next(iter(room.latest_partials))
            active_partial = room.latest_partials[first_key].model_dump()

        await websocket.send_json({
            "type": "init",
            "room_id": room_id,
            "target_language": lang,
            "history": recent_history,
            "active_partial": active_partial,
        })

        # 2. Continuous dispatch loop from subscriber queue
        while True:
            event = await subscriber.queue.get()

            # Apply mode filter if client only requested final segments
            if mode == "final" and not event.is_final:
                continue

            payload = {
                "type": "caption",
                "data": event.model_dump(),
            }
            await websocket.send_text(json.dumps(payload))

    except WebSocketDisconnect:
        logger.debug(f"Viewer '{subscriber_id}' disconnected from room '{room_id}'")
    except Exception as e:
        logger.error(f"Error in stream WebSocket '{subscriber_id}': {e}", exc_info=True)
    finally:
        try:
            await asyncio.shield(pubsub_broker.unsubscribe(subscriber))
        except Exception as e:
            logger.warning(f"Error unsubscribing '{subscriber_id}' from broker: {e}")
