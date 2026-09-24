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

# Realistic sample tech conference utterances in 8 supported languages (EN, ES, PT, FR, DE, IT, RU, ZH)
SPEECH_SCRIPT = [
    {
        "en": "Welcome everyone to the distributed systems keynote.",
        "es": "Bienvenidos a todos a la conferencia inaugural sobre sistemas distribuidos.",
        "pt": "Bem-vindos a todos à palestra principal sobre sistemas distribuídos.",
        "fr": "Bienvenue à tous à la conférence d'ouverture sur les systèmes distribués.",
        "de": "Willkommen alle zur Eröffnungs-Keynote über verteilte Systeme.",
        "it": "Benvenuti a tutti alla conferenza plenaria sui sistemi distribuiti.",
        "ru": "Добро пожаловать на пленарное заседание по распределенным системам.",
        "zh": "欢迎大家参加关于分布式系统的主题演讲。",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Today we are analyzing real-time backpressure in high-throughput pipelines.",
        "es": "Hoy analizamos la contrapresión en tiempo real en pipelines de alto rendimiento.",
        "pt": "Hoje estamos analisando a contrapressão em tempo real em pipelines de alto rendimento.",
        "fr": "Aujourd'hui, nous analysons la contre-pression en temps réel dans les pipelines à haut débit.",
        "de": "Heute analysieren wir Echtzeit-Gegendruck in Pipelines mit hohem Durchsatz.",
        "it": "Oggi analizziamo la contropressione in tempo reale nelle pipeline ad alto rendimento.",
        "ru": "Сегодня мы анализируем противодавление в реальном времени в высокопроизводительных конвейерах.",
        "zh": "今天我们分析高吞吐量数据管道中的实时背压机制。",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "When using Kubernetes and gRPC streaming, low latency is critical.",
        "es": "Al utilizar Kubernetes y streaming gRPC, la baja latencia es crítica.",
        "pt": "Ao usar Kubernetes e streaming gRPC, a baixa latência é crítica.",
        "fr": "Lors de l'utilisation de Kubernetes et du streaming gRPC, une faible latence est essentielle.",
        "de": "Bei der Verwendung von Kubernetes und gRPC-Streaming ist eine geringe Latenz entscheidend.",
        "it": "Quando si utilizzano Kubernetes e lo streaming gRPC, la bassa latenza è fondamentale.",
        "ru": "При использовании Kubernetes и потоковой передачи gRPC низкая задержка имеет решающее значение.",
        "zh": "在使用 Kubernetes 和 gRPC 流式传输时，低延迟至关重要。",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Our Gemini Live BidiGenerateContent protocol maintains under one second overhead.",
        "es": "Nuestro protocolo BidiGenerateContent de Gemini Live mantiene un overhead menor a un segundo.",
        "pt": "Nosso protocolo BidiGenerateContent do Gemini Live mantém uma sobrecarga menor que um segundo.",
        "fr": "Notre protocole BidiGenerateContent de Gemini Live maintient une surcharge inférieure à une seconde.",
        "de": "Unser Gemini Live BidiGenerateContent-Protokoll hält den Overhead unter einer Sekunde.",
        "it": "Il nostro protocollo BidiGenerateContent di Gemini Live mantiene un overhead inferiore a un secondo.",
        "ru": "Наш протокол Gemini Live BidiGenerateContent обеспечивает накладные расходы менее одной секунды.",
        "zh": "我们的 Gemini Live BidiGenerateContent 协议将延迟开销控制在一秒以内。",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Notice how the technical glossary stabilizes specialized acronyms automatically.",
        "es": "Observen cómo el glosario técnico estabiliza automáticamente los acrónimos especializados.",
        "pt": "Observe como o glossário técnico estabiliza automaticamente os acrônimos especializados.",
        "fr": "Remarquez comment le glossaire technique stabilise automatiquement les acronymes spécialisés.",
        "de": "Beachten Sie, wie das technische Glossar Fachakronyme automatisch stabilisiert.",
        "it": "Notate come il glossario tecnico stabilizza automaticamente gli acronimi specializzati.",
        "ru": "Обратите внимание, как технический глоссарий автоматически стабилизирует специализированные сокращения.",
        "zh": "请注意技术词汇表如何自动稳定专业缩写词的转译。",
        "speaker": "Dr. Sarah Chen",
    },
    {
        "en": "Thank you for joining us, let's open the floor for questions.",
        "es": "Gracias por acompañarnos, abrimos el espacio para preguntas.",
        "pt": "Obrigado por se juntar a nós, vamos abrir espaço para perguntas.",
        "fr": "Merci de votre présence, ouvrons maintenant la séance aux questions.",
        "de": "Vielen Dank für Ihre Teilnahme, wir eröffnen nun die Fragerunde.",
        "it": "Grazie per essere stati con noi, apriamo ora lo spazio alle domande.",
        "ru": "Спасибо за участие, теперь мы переходим к вопросам аудитории.",
        "zh": "感谢大家的参与，现在进入提问环节。",
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

    def _get_partial_text(self, full_text: str, lang: str, ratio: float) -> str:
        """Extract progressive partial text depending on language tokenization."""
        if lang == "zh":
            # Character based tokenization for Chinese ideograms
            chars = list(full_text)
            count = max(1, int(len(chars) * ratio))
            return "".join(chars[:count])
        else:
            words = full_text.split()
            count = max(1, int(len(words) * ratio))
            return " ".join(words[:count])

    async def _emit_partials(
        self,
        script_entry: dict[str, str],
        speaker: str,
        ratio: float,
    ) -> None:
        if not self._callback or not self._config:
            return

        event_id = f"partial-{self._current_sentence_idx}"
        en_full = script_entry.get("en", "")
        en_partial = self._get_partial_text(en_full, "en", ratio)

        for target_lang in self._config.target_languages:
            full_text = script_entry.get(target_lang, en_full)
            text = self._get_partial_text(full_text, target_lang, ratio)

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
        en_text = script_entry.get("en", "")

        for target_lang in self._config.target_languages:
            text = script_entry.get(target_lang, en_text)

            event = CaptionEvent(
                id=final_id,
                room_id=self._config.room_id,
                original_language=self._config.source_language,
                target_language=target_lang,
                text=text,
                original_text=en_text,
                is_final=True,
                start_ms=self._segment_start_ms,
                end_ms=self._total_audio_ms,
                confidence=0.98,
                speaker=speaker,
            )
            await self._callback(event)

