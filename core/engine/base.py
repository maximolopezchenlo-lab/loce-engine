"""Base abstractions and data contracts for LOCE transcription and translation."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from enum import Enum
from typing import Awaitable, Callable, Optional, Sequence
from pydantic import BaseModel, Field


class LanguagePair(str, Enum):
    EN_TO_ES = "en-es"
    ES_TO_EN = "es-en"
    EN_TO_PT = "en-pt"
    PT_TO_EN = "pt-en"
    ES_TO_PT = "es-pt"
    PT_TO_ES = "pt-es"
    EN_TO_EN = "en-en"
    ES_TO_ES = "es-es"
    PT_TO_PT = "pt-pt"


class AudioChunk(BaseModel):
    """Raw audio payload delivered from ingestion transport."""

    data: bytes
    sample_rate: int = 16000
    channels: int = 1
    sample_width: int = 2  # 16-bit linear PCM
    timestamp_ms: int = 0
    sequence_id: int = 0

    model_config = {"arbitrary_types_allowed": True}


class CaptionEvent(BaseModel):
    """Normalized caption emission dispatched to pub-sub and UI clients."""

    id: str = Field(..., description="Unique event identifier")
    room_id: str = Field(..., description="Target room identifier")
    original_language: str = Field(default="en", description="Source audio language (e.g. 'en', 'es', 'pt')")
    target_language: str = Field(default="es", description="Language of text (e.g. 'es', 'en', 'pt')")
    text: str = Field(..., description="Translated caption text for target_language")
    original_text: Optional[str] = Field(default=None, description="Original language transcript")
    is_final: bool = Field(default=False, description="True if final segment, False if live partial")
    start_ms: int = Field(default=0, description="Start offset in milliseconds relative to session start")
    end_ms: int = Field(default=0, description="End offset in milliseconds")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    speaker: Optional[str] = Field(default=None, description="Identified or attributed speaker name")
    timestamp_iso: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="UTC timestamp of emission",
    )


class TranscriptionConfig(BaseModel):
    """Configuration applied to an active transcription session."""

    room_id: str
    source_language: str = "en"
    target_languages: list[str] = Field(default_factory=lambda: ["es", "en", "pt"])
    sample_rate: int = 16000
    chunk_ms: int = 200
    system_instruction: Optional[str] = None
    glossary_terms: list[str] = Field(default_factory=list)
    speaker_names: list[str] = Field(default_factory=list)


CaptionCallback = Callable[[CaptionEvent], Awaitable[None]]


class TranscriptionProvider(ABC):
    """Abstract interface for streaming transcription and translation engines."""

    @abstractmethod
    async def start(
        self,
        config: TranscriptionConfig,
        event_callback: CaptionCallback,
    ) -> None:
        """Initialize provider connection and background receive loop."""
        pass

    @abstractmethod
    async def push_audio(self, chunk: AudioChunk) -> None:
        """Stream normalized audio chunk to the transcription provider."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Gracefully terminate upstream session and clean up resources."""
        pass

    @property
    @abstractmethod
    def is_healthy(self) -> bool:
        """Return True if connection to inference provider is active and healthy."""
        pass
