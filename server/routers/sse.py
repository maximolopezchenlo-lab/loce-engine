"""Server-Sent Events (SSE) streaming endpoint for subtitle distribution."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Optional
from fastapi import APIRouter, Query, Request
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/api/rooms/{room_id}/sse", tags=["SSE"])


@router.get("")
async def sse_caption_stream(
    room_id: str,
    request: Request,
    lang: Optional[str] = Query(default=None, description="Target language filter"),
):
    """Server-Sent Events stream for web clients without WebSocket support."""
    room_service = request.app.state.room_service
    pubsub_broker = request.app.state.pubsub_broker

    room = await room_service.get_or_create_room(room_id)
    subscriber_id = f"sse-{uuid.uuid4().hex[:8]}"

    subscriber = await pubsub_broker.subscribe(
        subscriber_id=subscriber_id,
        room_id=room_id,
        target_language=lang,
    )

    async def event_generator():
        try:
            # Emit initial snapshot
            recent = [
                e.model_dump() for e in room.history[-5:]
                if not lang or e.target_language == lang
            ]
            yield {
                "event": "init",
                "data": json.dumps({"room_id": room_id, "history": recent}),
            }

            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(subscriber.queue.get(), timeout=1.0)
                    yield {
                        "event": "caption",
                        "data": json.dumps(event.model_dump()),
                    }
                except asyncio.TimeoutError:
                    # Keepalive ping
                    yield {"event": "ping", "data": ""}
        finally:
            await pubsub_broker.unsubscribe(subscriber)

    return EventSourceResponse(event_generator())
