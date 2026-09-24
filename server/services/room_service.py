"""Room session orchestrator binding audio ingestion, inference, glossary and pub-sub."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from core.engine.base import (
    AudioChunk,
    CaptionEvent,
    SUPPORTED_LANGUAGES,
    TranscriptionConfig,
    TranscriptionProvider,
)
from core.engine.gemini_live import GeminiLiveProvider
from core.engine.mock_provider import MockStreamingProvider
from core.engine.gemma_local import GemmaLocalProvider
from core.glossary.glossary import GlossaryEngine, TechnicalGlossary

from core.ingestion.audio_consumer import AudioConsumer
from server.pubsub.broker import PubSubBroker

logger = logging.getLogger("loce.room_service")


class RoomStatus(str, Enum):
    IDLE = "idle"
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"


@dataclass
class RoomMetrics:
    total_bytes: int = 0
    total_chunks: int = 0
    partial_captions: int = 0
    final_captions: int = 0
    last_audio_timestamp: float = 0.0
    latencies_ms: list[float] = field(default_factory=list)

    @property
    def avg_latency_ms(self) -> float:
        if not self.latencies_ms:
            return 0.0
        return sum(self.latencies_ms[-50:]) / len(self.latencies_ms[-50:])

    @property
    def p95_latency_ms(self) -> float:
        if not self.latencies_ms:
            return 0.0
        sample = sorted(self.latencies_ms[-100:])
        idx = int(len(sample) * 0.95)
        return sample[min(idx, len(sample) - 1)]


class RoomSession:
    """Represents an active or provisioned conference track/room."""

    def __init__(
        self,
        room_id: str,
        name: str,
        source_language: str = "en",
        target_languages: Optional[list[str]] = None,
        provider_type: str = "mock",
        sample_rate: int = 16000,
        chunk_ms: int = 200,
        gemini_api_key: Optional[str] = None,
    ) -> None:
        self.room_id = room_id
        self.name = name
        self.source_language = source_language
        self.target_languages = target_languages or list(SUPPORTED_LANGUAGES)
        self.provider_type = provider_type
        self.sample_rate = sample_rate
        self.chunk_ms = chunk_ms
        self.status = RoomStatus.IDLE
        self.created_at = datetime.now(timezone.utc).isoformat()

        # Engine provider setup
        self.provider: TranscriptionProvider = self._create_provider(
            provider_type=provider_type,
            api_key=gemini_api_key,
        )
        self.audio_consumer = AudioConsumer(
            provider=self.provider,
            sample_rate=sample_rate,
            chunk_ms=chunk_ms,
        )

        self.history: list[CaptionEvent] = []
        self.latest_partials: dict[str, CaptionEvent] = {}  # lang -> latest partial
        self.metrics = RoomMetrics()
        self._lock = asyncio.Lock()

    def _create_provider(
        self,
        provider_type: str,
        api_key: Optional[str] = None,
    ) -> TranscriptionProvider:
        key = api_key or os.getenv("GEMINI_API_KEY", "")
        if provider_type == "gemini" and key:
            try:
                return GeminiLiveProvider(api_key=key, sample_rate=self.sample_rate)
            except Exception as e:
                logger.warning(f"Failed to instantiate GeminiLiveProvider: {e}. Falling back to MockStreamingProvider.")
                return MockStreamingProvider()
        elif provider_type == "gemma":
            try:
                return GemmaLocalProvider(sample_rate=self.sample_rate)
            except Exception as e:
                logger.warning(f"Failed to instantiate GemmaLocalProvider: {e}. Falling back to MockStreamingProvider.")
                return MockStreamingProvider()
        return MockStreamingProvider()



class RoomService:
    """Master manager for multi-room conference sessions."""

    def __init__(
        self,
        pubsub_broker: PubSubBroker,
        glossary_engine: GlossaryEngine,
        default_provider: str = "mock",
    ) -> None:
        self.broker = pubsub_broker
        self.glossary = glossary_engine
        self.default_provider = default_provider
        self._rooms: dict[str, RoomSession] = {}
        self._lock = asyncio.Lock()

    async def configure_room_provider(
        self,
        room_id: str,
        provider_type: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
    ) -> None:
        """Reconfigure or dynamically update inference provider and API credentials for a room."""
        room = self._rooms.get(room_id)
        if not room:
            return

        target_provider = provider_type or ("gemini" if gemini_api_key else room.provider_type)
        if gemini_api_key or (provider_type and provider_type != room.provider_type):
            logger.info(
                f"Dynamically configuring room '{room_id}' provider to '{target_provider}' (has_api_key={bool(gemini_api_key)})"
            )
            async with room._lock:
                was_active = (room.status == RoomStatus.ACTIVE)
                if was_active:
                    try:
                        await room.audio_consumer.finish()
                    except Exception as e:
                        logger.debug(f"Audio consumer finish notice: {e}")
                    try:
                        await room.provider.stop()
                    except Exception as e:
                        logger.debug(f"Provider stop notice: {e}")

                room.provider_type = target_provider
                room.provider = room._create_provider(
                    provider_type=target_provider,
                    api_key=gemini_api_key,
                )
                room.audio_consumer = AudioConsumer(
                    provider=room.provider,
                    sample_rate=room.sample_rate,
                    chunk_ms=room.chunk_ms,
                )

                if was_active:
                    prompt_context = self.glossary.build_prompt_context(room_id)
                    config = TranscriptionConfig(
                        room_id=room.room_id,
                        source_language=room.source_language,
                        target_languages=room.target_languages,
                        sample_rate=room.sample_rate,
                        chunk_ms=room.chunk_ms,
                        glossary_terms=prompt_context["terms"],
                        speaker_names=prompt_context["speakers"],
                    )

                    async def _on_caption_event(event: CaptionEvent) -> None:
                        await self._handle_caption_emission(room, event)

                    await room.provider.start(config=config, event_callback=_on_caption_event)
                    room.status = RoomStatus.ACTIVE
                    logger.info(
                        f"Room '{room_id}' successfully reconfigured and restarted with provider '{target_provider}'"
                    )

    async def get_or_create_room(
        self,
        room_id: str,
        name: Optional[str] = None,
        source_language: str = "en",
        target_languages: Optional[list[str]] = None,
        provider_type: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
    ) -> RoomSession:
        """Fetch existing room or dynamically initialize a new one with optional runtime credentials."""
        async with self._lock:
            if room_id in self._rooms:
                room = self._rooms[room_id]
                if gemini_api_key or (provider_type and provider_type != room.provider_type):
                    await self.configure_room_provider(
                        room_id=room_id,
                        provider_type=provider_type,
                        gemini_api_key=gemini_api_key,
                    )
                return self._rooms[room_id]

            chosen_provider = provider_type or ("gemini" if gemini_api_key else self.default_provider)
            room = RoomSession(
                room_id=room_id,
                name=name or f"Room {room_id.upper()}",
                source_language=source_language,
                target_languages=target_languages or list(SUPPORTED_LANGUAGES),
                provider_type=chosen_provider,
                gemini_api_key=gemini_api_key,
            )
            self._rooms[room_id] = room

        # Auto-start room session
        await self.start_room(room_id)
        return room

    async def start_room(self, room_id: str) -> None:
        """Start provider inference loops for room."""
        room = self._rooms.get(room_id)
        if not room or room.status == RoomStatus.ACTIVE:
            return

        async with room._lock:
            prompt_context = self.glossary.build_prompt_context(room_id)
            config = TranscriptionConfig(
                room_id=room.room_id,
                source_language=room.source_language,
                target_languages=room.target_languages,
                sample_rate=room.sample_rate,
                chunk_ms=room.chunk_ms,
                glossary_terms=prompt_context["terms"],
                speaker_names=prompt_context["speakers"],
            )

            async def _on_caption_event(event: CaptionEvent) -> None:
                await self._handle_caption_emission(room, event)

            await room.provider.start(config=config, event_callback=_on_caption_event)
            room.status = RoomStatus.ACTIVE
            logger.info(f"Room '{room_id}' is now ACTIVE with provider '{room.provider_type}'")

    async def stop_room(self, room_id: str) -> None:
        """Stop provider and mark room status as STOPPED."""
        room = self._rooms.get(room_id)
        if not room:
            return

        async with room._lock:
            await room.audio_consumer.finish()
            await room.provider.stop()
            room.status = RoomStatus.STOPPED
            logger.info(f"Room '{room_id}' is now STOPPED.")

    async def ingest_audio(
        self,
        room_id: str,
        data: bytes,
        sample_rate: Optional[int] = None,
        channels: Optional[int] = None,
    ) -> int:
        """Ingest raw audio bytes into the designated room."""
        room = self._rooms.get(room_id)
        if not room:
            room = await self.get_or_create_room(room_id)

        if room.status != RoomStatus.ACTIVE:
            await self.start_room(room_id)

        now = time.time()
        room.metrics.last_audio_timestamp = now
        room.metrics.total_bytes += len(data)

        chunks_dispatched = await room.audio_consumer.ingest_bytes(
            data=data,
            sample_rate=sample_rate,
            channels=channels,
        )
        room.metrics.total_chunks += chunks_dispatched
        return chunks_dispatched

    async def _handle_caption_emission(self, room: RoomSession, event: CaptionEvent) -> None:
        """Run post-correction glossary and dispatch to pub-sub broker."""
        # Measure latency
        if room.metrics.last_audio_timestamp > 0:
            latency_ms = (time.time() - room.metrics.last_audio_timestamp) * 1000
            room.metrics.latencies_ms.append(max(20.0, latency_ms))

        # 1. Apply glossary post-processing
        corrected_text = self.glossary.correct_text(event.text, room.room_id)
        corrected_original = (
            self.glossary.correct_text(event.original_text, room.room_id)
            if event.original_text
            else None
        )

        sanitized_event = event.model_copy(
            update={
                "text": corrected_text,
                "original_text": corrected_original,
            }
        )

        # 2. Update room history and partial buffers
        if sanitized_event.is_final:
            room.history.append(sanitized_event)
            room.metrics.final_captions += 1
            if sanitized_event.target_language in room.latest_partials:
                del room.latest_partials[sanitized_event.target_language]
        else:
            room.latest_partials[sanitized_event.target_language] = sanitized_event
            room.metrics.partial_captions += 1

        # 3. Publish to PubSub broker for real-time WebSocket/SSE fan-out
        await self.broker.publish(sanitized_event)

    def get_room(self, room_id: str) -> Optional[RoomSession]:
        return self._rooms.get(room_id)

    def list_rooms(self) -> list[dict]:
        """Return list of rooms with real-time operational status."""
        result = []
        for r in self._rooms.values():
            result.append(
                {
                    "room_id": r.room_id,
                    "name": r.name,
                    "status": r.status.value,
                    "source_language": r.source_language,
                    "target_languages": r.target_languages,
                    "provider_type": r.provider_type,
                    "is_healthy": r.provider.is_healthy,
                    "subscribers": self.broker.get_subscriber_count(r.room_id),
                    "total_bytes": r.metrics.total_bytes,
                    "total_chunks": r.metrics.total_chunks,
                    "partial_captions": r.metrics.partial_captions,
                    "final_captions": r.metrics.final_captions,
                    "avg_latency_ms": round(r.metrics.avg_latency_ms, 1),
                    "p95_latency_ms": round(r.metrics.p95_latency_ms, 1),
                    "history_count": len(r.history),
                }
            )
        return result
