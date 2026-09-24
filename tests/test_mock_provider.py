"""Tests for MockStreamingProvider audio ingestion and event emissions."""

import asyncio
import pytest
from core.engine.base import AudioChunk, CaptionEvent, TranscriptionConfig
from core.engine.mock_provider import MockStreamingProvider


@pytest.mark.asyncio
async def test_mock_provider_lifecycle_and_emissions():
    provider = MockStreamingProvider()
    events: list[CaptionEvent] = []

    async def _on_event(event: CaptionEvent):
        events.append(event)

    config = TranscriptionConfig(
        room_id="test-room",
        source_language="en",
        target_languages=["es", "en", "pt"],
        sample_rate=16000,
        chunk_ms=200,
    )

    await provider.start(config, _on_event)
    assert provider.is_healthy is True

    # Push 3.0s worth of audio = 16000 * 2 * 3.0 = 96000 bytes
    # Feed in 200ms chunks (6400 bytes each)
    chunk_bytes = 6400
    for i in range(15):
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

    # Allow background loop to process
    await asyncio.sleep(0.3)

    assert len(events) > 0
    # Must have produced both partials and finals
    partials = [e for e in events if not e.is_final]
    finals = [e for e in events if e.is_final]

    assert len(partials) > 0
    assert len(finals) > 0

    # Ensure languages are respected
    es_finals = [e for e in finals if e.target_language == "es"]
    en_finals = [e for e in finals if e.target_language == "en"]
    pt_finals = [e for e in finals if e.target_language == "pt"]
    assert len(es_finals) > 0
    assert len(en_finals) > 0
    assert len(pt_finals) > 0

    # Ensure Portuguese partials also exist
    pt_partials = [e for e in partials if e.target_language == "pt"]
    assert len(pt_partials) > 0

    await provider.stop()
    assert provider.is_healthy is False


@pytest.mark.asyncio
async def test_mock_provider_all_8_languages():
    from core.engine.base import SUPPORTED_LANGUAGES

    provider = MockStreamingProvider()
    events: list[CaptionEvent] = []

    async def _on_event(event: CaptionEvent):
        events.append(event)

    config = TranscriptionConfig(
        room_id="room-octa",
        source_language="en",
        target_languages=list(SUPPORTED_LANGUAGES),
        sample_rate=16000,
        chunk_ms=200,
    )

    await provider.start(config, _on_event)

    # Push 3.2s of audio (16 chunks of 200ms)
    chunk_bytes = 6400
    for i in range(16):
        chunk = AudioChunk(
            data=b"\x00\x02" * (chunk_bytes // 2),
            sample_rate=16000,
            channels=1,
            sample_width=2,
            timestamp_ms=i * 200,
            sequence_id=i,
        )
        await provider.push_audio(chunk)
        await asyncio.sleep(0.01)

    await asyncio.sleep(0.4)

    # Verify that each of the 8 languages received partial and final captions
    for lang in SUPPORTED_LANGUAGES:
        lang_partials = [e for e in events if not e.is_final and e.target_language == lang]
        lang_finals = [e for e in events if e.is_final and e.target_language == lang]
        assert len(lang_partials) > 0, f"Expected partials for language {lang}"
        assert len(lang_finals) > 0, f"Expected finals for language {lang}"

    # Verify Chinese characters are not empty
    zh_final = next(e for e in events if e.is_final and e.target_language == "zh")
    assert any("\u4e00" <= char <= "\u9fff" for char in zh_final.text)

    # Verify Russian characters are not empty
    ru_final = next(e for e in events if e.is_final and e.target_language == "ru")
    assert any("\u0400" <= char <= "\u04ff" for char in ru_final.text)

    await provider.stop()


