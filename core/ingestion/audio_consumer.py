"""Audio stream consumer orchestrating normalization and feeding transcription providers."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from core.engine.base import AudioChunk, TranscriptionProvider
from core.ingestion.normalizer import AudioNormalizer

logger = logging.getLogger("loce.audio_consumer")


class AudioConsumer:
    """Consumes incoming audio bytes from transport connections, normalizes, and feeds provider."""

    def __init__(
        self,
        provider: TranscriptionProvider,
        sample_rate: int = 16000,
        chunk_ms: int = 200,
        input_sample_rate: int = 16000,
        input_channels: int = 1,
    ) -> None:
        self.provider = provider
        self.normalizer = AudioNormalizer(
            target_sample_rate=sample_rate,
            chunk_ms=chunk_ms,
            input_sample_rate=input_sample_rate,
            input_channels=input_channels,
        )
        self.total_bytes_received: int = 0
        self.total_chunks_dispatched: int = 0
        self._lock = asyncio.Lock()

    async def ingest_bytes(
        self,
        data: bytes,
        sample_rate: Optional[int] = None,
        channels: Optional[int] = None,
    ) -> int:
        """Process incoming raw audio bytes and forward generated chunks to provider.

        Returns the number of chunks forwarded.
        """
        if not data:
            return 0

        async with self._lock:
            self.total_bytes_received += len(data)
            chunks = self.normalizer.process_raw_bytes(
                data=data,
                sample_rate=sample_rate,
                channels=channels,
            )

            for chunk in chunks:
                await self.provider.push_audio(chunk)
                self.total_chunks_dispatched += 1

            return len(chunks)

    async def finish(self) -> None:
        """Flush remaining buffer and close ingest stream."""
        async with self._lock:
            final_chunk = self.normalizer.flush()
            if final_chunk:
                await self.provider.push_audio(final_chunk)
                self.total_chunks_dispatched += 1
