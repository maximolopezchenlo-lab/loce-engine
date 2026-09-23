"""High-fidelity simulated transcription provider for offline tests and local development."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional
from core.engine.base import (
    AudioChunk,
    CaptionCallback,
    CaptionEvent,
    TranscriptionConfig,
    TranscriptionProvider,
)

logger = logging.getLogger("loce.mock_provider")

# Realistic sample tech conference utterances (source EN, target ES, PT)
SPEECH_SCRIPT = [
    {
        "en": "Welcome everyone to the distributed systems keynote.",
        "es": "Bienvenidos a todos a la conferencia inaugural sobre sistemas distribuidos.",
        "pt": "Bem-vindos a todos à palestra principal sobre sistemas distribuídos.",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Today we are analyzing real-time backpressure in high-throughput pipelines.",
        "es": "Hoy analizamos la contrapresión en tiempo real en pipelines de alto rendimiento.",
        "pt": "Hoje estamos analisando a contrapressão em tempo real em pipelines de alto rendimento.",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "When using Kubernetes and gRPC streaming, low latency is critical.",
        "es": "Al utilizar Kubernetes y streaming gRPC, la baja latencia es crítica.",
        "pt": "Ao usar Kubernetes e streaming gRPC, a baixa latência é crítica.",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Our Gemini Live BidiGenerateContent protocol maintains under one second overhead.",
        "es": "Nuestro protocolo BidiGenerateContent de Gemini Live mantiene un overhead menor a un segundo.",
        "pt": "Nosso protocolo BidiGenerateContent do Gemini Live mantém uma sobrecarga menor que um segundo.",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Notice how the technical glossary stabilizes specialized acronyms automatically.",
        "es": "Observen cómo el glosario técnico estabiliza automáticamente los acrónimos especializados.",
        "pt": "Observe como o glossário técnico estabiliza automaticamente os acrônimos especializados.",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Thank you for joining us, let's open the floor for questions.",
        "es": "Gracias por acompañarnos, abrimos el espacio para preguntas.",
        "pt": "Obrigado por se juntar a nós, vamos abrir espaço para perguntas.",
        "speaker": "Dr. Sarah Chen",
    },
]


class MockStreamingProvider(TranscriptionProvider):
    """Simulates real-time streaming speech recognition with realistic cadence.

    Consumes audio bytes, tracks speech duration, delivers partial tokens,
    and commits final stabilized segments for every requested target language.
    """

    def __init__(self, speed_multiplier: float = 1.0) -> None:
        self._config: Optional[TranscriptionConfig] = None
        self._callback: Optional[CaptionCallback] = None
        self._running: bool = False
        self._audio_queue: asyncio.Queue[AudioChunk] = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task[None]] = None
        self._speed_multiplier = speed_multiplier
        self._accumulated_audio_bytes: int = 0
        self._total_audio_ms: int = 0
        self._current_sentence_idx: int = 0
        self._segment_start_ms: int = 0

    @property
    def is_healthy(self) -> bool:
        return self._running and (self._worker_task is not None and not self._worker_task.done())

    async def start(
        self,
        config: TranscriptionConfig,
        event_callback: CaptionCallback,
    ) -> None:
        self._config = config
        self._callback = event_callback
        self._running = True
        self._accumulated_audio_bytes = 0
        self._total_audio_ms = 0
        self._current_sentence_idx = 0
        self._segment_start_ms = 0
        self._worker_task = asyncio.create_task(self._process_loop(), name=f"mock-worker-{config.room_id}")
        logger.info(f"MockStreamingProvider initialized for room '{config.room_id}'")

    async def push_audio(self, chunk: AudioChunk) -> None:
        if not self._running:
            return
        await self._audio_queue.put(chunk)

    async def stop(self) -> None:
        self._running = False
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        # Drain queue
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        logger.info("MockStreamingProvider stopped.")

    async def _process_loop(self) -> None:
        """Background loop reading audio chunks and firing simulated speech events."""
        bytes_per_second = self._config.sample_rate * 2  # 16-bit mono = 2 bytes per sample
        bytes_per_sentence = int(bytes_per_second * 2.8)  # ~2.8s per utterance

        sentence_progress_bytes = 0
        partial_step = 0

        while self._running:
            try:
                chunk = await asyncio.wait_for(self._audio_queue.get(), timeout=0.1)
                chunk_bytes = len(chunk.data)
                self._accumulated_audio_bytes += chunk_bytes
                sentence_progress_bytes += chunk_bytes
                chunk_duration_ms = int((chunk_bytes / bytes_per_second) * 1000)
                self._total_audio_ms += chunk_duration_ms

                script_entry = SPEECH_SCRIPT[self._current_sentence_idx % len(SPEECH_SCRIPT)]
                speaker = script_entry["speaker"]

                # Emit progressive partial captions every ~400ms of audio
                ratio = min(sentence_progress_bytes / bytes_per_sentence, 1.0)
                current_step = int(ratio * 5)  # 5 partial stages

                if current_step > partial_step and current_step < 5:
                    partial_step = current_step
                    await self._emit_partials(script_entry, speaker, ratio)

                # Sentence finished: commit final segment
                if sentence_progress_bytes >= bytes_per_sentence:
                    await self._emit_finals(script_entry, speaker)
                    # Advance to next sentence
                    self._current_sentence_idx += 1
                    sentence_progress_bytes = 0
                    partial_step = 0
                    self._segment_start_ms = self._total_audio_ms

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in mock processing loop: {e}", exc_info=True)

    async def _emit_partials(
        self,
        script_entry: dict[str, str],
        speaker: str,
        ratio: float,
    ) -> None:
        if not self._callback or not self._config:
            return

        en_words = script_entry["en"].split()
        es_words = script_entry["es"].split()
        pt_words = script_entry.get("pt", script_entry["es"]).split()

        en_count = max(1, int(len(en_words) * ratio))
        es_count = max(1, int(len(es_words) * ratio))
        pt_count = max(1, int(len(pt_words) * ratio))

        en_partial = " ".join(en_words[:en_count])
        es_partial = " ".join(es_words[:es_count])
        pt_partial = " ".join(pt_words[:pt_count])

        event_id = f"partial-{self._current_sentence_idx}"

        for target_lang in self._config.target_languages:
            if target_lang.startswith("es"):
                text = es_partial
            elif target_lang.startswith("pt"):
                text = pt_partial
            else:
                text = en_partial

            event = CaptionEvent(
                id=event_id,
                room_id=self._config.room_id,
                original_language=self._config.source_language,
                target_language=target_lang,
                text=text,
                original_text=en_partial,
                is_final=False,
                start_ms=self._segment_start_ms,
                end_ms=self._total_audio_ms,
                confidence=0.88,
                speaker=speaker,
            )
            await self._callback(event)

    async def _emit_finals(
        self,
        script_entry: dict[str, str],
        speaker: str,
    ) -> None:
        if not self._callback or not self._config:
            return

        final_id = f"final-{self._current_sentence_idx}-{uuid.uuid4().hex[:6]}"

        for target_lang in self._config.target_languages:
            if target_lang.startswith("es"):
                text = script_entry["es"]
            elif target_lang.startswith("pt"):
                text = script_entry.get("pt", script_entry["es"])
            else:
                text = script_entry["en"]

            event = CaptionEvent(
                id=final_id,
                room_id=self._config.room_id,
                original_language=self._config.source_language,
                target_language=target_lang,
                text=text,
                original_text=script_entry["en"],
                is_final=True,
                start_ms=self._segment_start_ms,
                end_ms=self._total_audio_ms,
                confidence=0.98,
                speaker=speaker,
            )
            await self._callback(event)
