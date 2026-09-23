"""High-throughput PubSub broker with Redis clustering adapter and In-Memory fallback."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Optional, Set
from core.engine.base import CaptionEvent

logger = logging.getLogger("loce.pubsub")

try:
    import redis.asyncio as aioredis
    HAS_REDIS = True
except ImportError:
    aioredis = None  # type: ignore
    HAS_REDIS = False


@dataclass
class Subscriber:
    """Represents an active client stream subscriber (WebSocket or SSE)."""

    id: str
    room_id: str
    target_language: Optional[str] = None  # None means subscribe to all languages in room
    queue: asyncio.Queue[CaptionEvent] = field(default_factory=lambda: asyncio.Queue(maxsize=150))
    dropped_events: int = 0

    def __hash__(self) -> int:
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Subscriber):
            return False
        return self.id == other.id

    async def put(self, event: CaptionEvent) -> None:
        """Enqueue event with selective backpressure: drop stale partials, preserve finals."""
        # Filter check
        if self.target_language and event.target_language != self.target_language:
            return

        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            # Queue is full: inspect buffered events to preserve finals
            temp_items: list[CaptionEvent] = []
            evicted_partial = False

            while not self.queue.empty():
                try:
                    item = self.queue.get_nowait()
                    if not evicted_partial and not item.is_final:
                        # Drop this stale partial
                        evicted_partial = True
                        self.dropped_events += 1
                    else:
                        temp_items.append(item)
                except asyncio.QueueEmpty:
                    break

            # Re-enqueue retained items
            for item in temp_items:
                try:
                    self.queue.put_nowait(item)
                except asyncio.QueueFull:
                    break

            if evicted_partial:
                # Successfully made room: enqueue new event
                try:
                    self.queue.put_nowait(event)
                except asyncio.QueueFull:
                    if event.is_final:
                        await self.queue.put(event)
                    else:
                        self.dropped_events += 1
            else:
                # No partial was found in the queue (all items are finals)
                if event.is_final:
                    # Forced put for final: replace oldest if full
                    try:
                        self.queue.get_nowait()
                        self.queue.put_nowait(event)
                    except Exception:
                        pass
                else:
                    # Drop incoming partial to protect finals
                    self.dropped_events += 1


class PubSubBroker:
    """Broadcasts caption events to room subscribers with optional Redis multi-node distribution."""

    def __init__(self, redis_url: Optional[str] = None) -> None:
        self.redis_url = redis_url or os.getenv("REDIS_URL", "")
        # room_id -> set of Subscriber
        self._subscribers: dict[str, Set[Subscriber]] = {}
        self._lock = asyncio.Lock()
        self._total_published: int = 0

        # Redis adapter state
        self._redis: Optional[aioredis.Redis] = None
        self._pubsub: Optional[aioredis.client.PubSub] = None
        self._using_redis: bool = False
        self._redis_tasks: dict[str, asyncio.Task[None]] = {}
        self._initialized: bool = False

    async def initialize(self) -> None:
        """Attempt non-blocking connection to Redis; gracefully fallback to In-Memory."""
        if self._initialized:
            return
        self._initialized = True

        if self.redis_url and HAS_REDIS and aioredis is not None:
            try:
                client = aioredis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=1.5,
                    socket_timeout=1.5,
                )
                await asyncio.wait_for(client.ping(), timeout=1.5)
                self._redis = client
                self._using_redis = True
                logger.info(f"Connected to Redis Pub/Sub cluster at '{self.redis_url}'.")
            except Exception as e:
                logger.warning(
                    f"Redis connection to '{self.redis_url}' failed: {e}. "
                    "Operating with high-throughput In-Memory PubSub fallback."
                )
                self._using_redis = False
                self._redis = None
        else:
            if self.redis_url and not HAS_REDIS:
                logger.warning("REDIS_URL provided but 'redis' package is not installed. Using In-Memory fallback.")
            logger.info("Using standard In-Memory PubSub broker.")

    @property
    def is_using_redis(self) -> bool:
        return self._using_redis

    async def subscribe(
        self,
        subscriber_id: str,
        room_id: str,
        target_language: Optional[str] = None,
    ) -> Subscriber:
        """Register a new subscriber to a room's caption feed."""
        if not self._initialized:
            await self.initialize()

        sub = Subscriber(
            id=subscriber_id,
            room_id=room_id,
            target_language=target_language,
        )
        async with self._lock:
            first_in_room = room_id not in self._subscribers or len(self._subscribers[room_id]) == 0
            if room_id not in self._subscribers:
                self._subscribers[room_id] = set()
            self._subscribers[room_id].add(sub)

        # If Redis enabled and first subscriber, listen to channel
        if self._using_redis and first_in_room:
            self._start_redis_room_listener(room_id)

        logger.debug(
            f"Subscriber '{subscriber_id}' joined room '{room_id}' (lang: {target_language or 'all'}). "
            f"Active: {len(self._subscribers[room_id])}"
        )
        return sub

    async def unsubscribe(self, sub: Subscriber) -> None:
        """Remove a subscriber and clean up empty rooms."""
        room_empty = False
        async with self._lock:
            if sub.room_id in self._subscribers:
                self._subscribers[sub.room_id].discard(sub)
                if not self._subscribers[sub.room_id]:
                    del self._subscribers[sub.room_id]
                    room_empty = True

        if self._using_redis and room_empty:
            self._stop_redis_room_listener(sub.room_id)

        logger.debug(f"Subscriber '{sub.id}' unsubscribed from room '{sub.room_id}'.")

    async def publish(self, event: CaptionEvent) -> int:
        """Broadcast event to all interested subscribers (local and across Redis cluster)."""
        if not self._initialized:
            await self.initialize()

        self._total_published += 1

        # 1. If Redis is active, publish to cross-node cluster channel asynchronously
        if self._using_redis and self._redis:
            try:
                channel = f"loce:room:{event.room_id}"
                raw_json = event.model_dump_json()
                asyncio.create_task(self._redis.publish(channel, raw_json))
            except Exception as e:
                logger.warning(f"Failed to publish event to Redis: {e}")

        # 2. Local delivery to node subscribers
        return await self._dispatch_local(event)

    async def _dispatch_local(self, event: CaptionEvent) -> int:
        """Enqueue event to all local subscribers registered on this node."""
        room_id = event.room_id
        subscribers_snapshot: list[Subscriber] = []
        async with self._lock:
            if room_id in self._subscribers:
                subscribers_snapshot = list(self._subscribers[room_id])

        if not subscribers_snapshot:
            return 0

        count = 0
        for sub in subscribers_snapshot:
            await sub.put(event)
            count += 1

        return count

    def _start_redis_room_listener(self, room_id: str) -> None:
        """Subscribe to Redis channel for multi-node event reception."""
        if room_id in self._redis_tasks:
            return

        async def _listener():
            channel = f"loce:room:{room_id}"
            try:
                if not self._redis:
                    return
                pubsub = self._redis.pubsub()
                await pubsub.subscribe(channel)
                logger.debug(f"Subscribed to Redis channel '{channel}'")

                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            event = CaptionEvent.model_validate(data)
                            await self._dispatch_local(event)
                        except Exception as parse_err:
                            logger.error(f"Error parsing Redis message: {parse_err}")
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Redis listener loop error for room '{room_id}': {e}")

        task = asyncio.create_task(_listener(), name=f"redis-listener-{room_id}")
        self._redis_tasks[room_id] = task

    def _stop_redis_room_listener(self, room_id: str) -> None:
        """Cancel Redis subscription task for emptied room."""
        task = self._redis_tasks.pop(room_id, None)
        if task and not task.done():
            task.cancel()

    def get_subscriber_count(self, room_id: str) -> int:
        """Return count of active subscribers for a given room."""
        if room_id in self._subscribers:
            return len(self._subscribers[room_id])
        return 0

    @property
    def total_active_subscribers(self) -> int:
        return sum(len(subs) for subs in self._subscribers.values())

    async def close(self) -> None:
        """Clean up background tasks and Redis connection."""
        for task in self._redis_tasks.values():
            if not task.done():
                task.cancel()
        self._redis_tasks.clear()

        if self._redis:
            try:
                await self._redis.close()
            except Exception:
                pass
            self._redis = None
        self._using_redis = False
        logger.info("PubSubBroker shut down.")
