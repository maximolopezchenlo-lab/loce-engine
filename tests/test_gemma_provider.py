"""Unit and integration tests for GemmaLocalProvider (on-premise / air-gapped streaming)."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import httpx

from core.engine.base import AudioChunk, CaptionEvent, TranscriptionConfig
from core.engine.gemma_local import GemmaLocalProvider
from core.glossary.glossary import GlossaryEngine
from server.pubsub.broker import PubSubBroker
from server.services.room_service import RoomService


@pytest.mark.asyncio
async def test_gemma_provider_system_instruction():
    provider = GemmaLocalProvider(base_url="http://localhost:11434", model="gemma2:2b")
    config = TranscriptionConfig(
        room_id="on-prem-room",
        source_language="en",
        target_languages=["es", "en", "pt"],
        glossary_terms=["Kubernetes", "gRPC", "FastAPI"],
        speaker_names=["Alice TechLead", "Bob Architect"],
    )

    instruction = provider._build_system_instruction(config)
    assert "LOCE" in instruction
    assert "Kubernetes" in instruction
    assert "gRPC" in instruction
    assert "FastAPI" in instruction
    assert "Alice TechLead" in instruction
    assert "Bob Architect" in instruction
    assert "CRITICAL TECHNICAL GLOSSARY" in instruction


@pytest.mark.asyncio
async def test_gemma_provider_fallback_emissions_when_offline():
    """Verify provider does not crash when local Gemma runtime is offline and emits fallback captions."""
    provider = GemmaLocalProvider(base_url="http://127.0.0.1:9999", model="gemma2:2b")
    events: list[CaptionEvent] = []

    async def _on_event(event: CaptionEvent):
        events.append(event)

    config = TranscriptionConfig(
        room_id="offline-stage",
        source_language="en",
        target_languages=["es", "en", "pt"],
        sample_rate=16000,
        chunk_ms=200,
    )

    await provider.start(config, _on_event)
    # Since port 9999 has no server, provider is running in resilient fallback mode
    assert provider._running is True
    assert provider.is_healthy is False  # connected is False

    # Push 10 audio chunks (2.0s worth) to trigger partials and at least one final
    chunk_bytes = 6400
    for i in range(10):
        chunk = AudioChunk(
            data=b"\x00\x01" * (chunk_bytes // 2),
            sample_rate=16000,
            channels=1,
            sample_width=2,
            timestamp_ms=i * 200,
            sequence_id=i,
        )
        await provider.push_audio(chunk)
        await asyncio.sleep(0.01)

    await asyncio.sleep(0.3)

    assert len(events) > 0
    partials = [e for e in events if not e.is_final]
    finals = [e for e in events if e.is_final]

    assert len(partials) > 0
    assert len(finals) > 0

    # Verify trilingual routing
    languages_emitted = {e.target_language for e in finals}
    assert "es" in languages_emitted
    assert "en" in languages_emitted
    assert "pt" in languages_emitted

    await provider.stop()
    assert provider.is_healthy is False


@pytest.mark.asyncio
async def test_gemma_provider_streaming_ollama_mock():
    """Verify streaming token consumption and JSON parsing with mocked Ollama API."""
    provider = GemmaLocalProvider(base_url="http://localhost:11434", model="gemma2:2b")
    events: list[CaptionEvent] = []

    async def _on_event(event: CaptionEvent):
        events.append(event)

    config = TranscriptionConfig(
        room_id="ollama-mock-stage",
        source_language="en",
        target_languages=["es", "en", "pt"],
        sample_rate=16000,
        chunk_ms=200,
    )

    # Mock health probe to return True
    provider._probe_health = AsyncMock(return_value=True)

    # Mock streaming chat generator
    mock_payload = json.dumps({
        "en": "Welcome everyone to our keynote session.",
        "es": "Bienvenidos a todos a nuestra sesión magistral.",
        "pt": "Bem-vindos a todos à nossa sessão principal.",
    })

    async def mock_stream_gemma_chat(prompt, system):
        # Stream in two token chunks
        yield mock_payload[:30]
        yield mock_payload[30:]

    provider._stream_gemma_chat = mock_stream_gemma_chat

    await provider.start(config, _on_event)
    assert provider._connected is True

    # Push 9 chunks to trigger final segment completion
    chunk_bytes = 6400
    for i in range(9):
        chunk = AudioChunk(
            data=b"\x00\x01" * (chunk_bytes // 2),
            sample_rate=16000,
            channels=1,
            sample_width=2,
            timestamp_ms=i * 200,
            sequence_id=i,
        )
        await provider.push_audio(chunk)
        await asyncio.sleep(0.01)

    await asyncio.sleep(0.2)

    finals = [e for e in events if e.is_final]
    assert len(finals) >= 3

    es_final = next(e for e in finals if e.target_language == "es")
    pt_final = next(e for e in finals if e.target_language == "pt")

    assert "Bienvenidos a todos a nuestra sesión magistral." in es_final.text
    assert "Bem-vindos a todos à nossa sessão principal." in pt_final.text

    await provider.stop()


@pytest.mark.asyncio
async def test_room_service_creates_gemma_provider():
    """Verify RoomService provisions and activates a room with GemmaLocalProvider."""
    broker = PubSubBroker()
    glossary = GlossaryEngine()
    room_service = RoomService(pubsub_broker=broker, glossary_engine=glossary, default_provider="gemma")

    room = await room_service.get_or_create_room("gemma-stage", provider_type="gemma")
    assert room.provider_type == "gemma"
    assert isinstance(room.provider, GemmaLocalProvider)
    assert room.provider.model == "gemma2:2b"

    await room_service.stop_room("gemma-stage")
    await broker.close()
