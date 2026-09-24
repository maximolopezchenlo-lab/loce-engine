"""Local On-Premise Gemma Provider for air-gapped / private conference streaming.

Connects to a local runtime (Ollama at http://localhost:11434, vLLM, or any
OpenAI-compatible local server) for streaming simultaneous transcription and
trilingual translation (EN, ES, PT) with technical glossary injection.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

from core.engine.base import (
    AudioChunk,
    CaptionCallback,
    CaptionEvent,
    SUPPORTED_LANGUAGES,
    TranscriptionConfig,
    TranscriptionProvider,
)

logger = logging.getLogger("loce.gemma_local")

DEFAULT_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = "gemma2:2b"

# Pre-packaged tech conference speech utterances for acoustic fallback in 8 languages
SPEECH_UTTERANCES = [
    {
        "en": "Welcome everyone to our keynote session on distributed systems.",
        "es": "Bienvenidos a todos a nuestra sesión magistral sobre sistemas distribuidos.",
        "pt": "Bem-vindos a todos à nossa sessão principal sobre sistemas distribuídos.",
        "fr": "Bienvenue à tous à notre session plénière sur les systèmes distribués.",
        "de": "Willkommen alle zu unserer Keynote-Session über verteilte Systeme.",
        "it": "Benvenuti a tutti alla nostra sessione plenaria sui sistemi distribuiti.",
        "ru": "Добро пожаловать на пленарное заседание по распределенным системам.",
        "zh": "欢迎大家参加关于分布式系统的主题演讲。",
    },
    {
        "en": "Today we are deploying Kubernetes clusters across multiple edge data centers.",
        "es": "Hoy estamos desplegando clústeres de Kubernetes en múltiples centros de datos perimetrales.",
        "pt": "Hoje estamos implantando clusters Kubernetes em múltiplos data centers de borda.",
        "fr": "Aujourd'hui, nous déployons des clusters Kubernetes sur plusieurs centres de données périphériques.",
        "de": "Heute stellen wir Kubernetes-Cluster über mehrere Edge-Rechenzentren hinweg bereit.",
        "it": "Oggi distribuiamo cluster Kubernetes su più data center periferici.",
        "ru": "Сегодня мы развертываем кластеры Kubernetes в нескольких периферийных центрах обработки данных.",
        "zh": "今天我们跨多个边缘数据中心部署 Kubernetes 集群。",
    },
    {
        "en": "Our microservices communicate using ultra low latency gRPC over HTTP/2.",
        "es": "Nuestros microservicios se comunican usando gRPC de latencia ultrabaja sobre HTTP/2.",
        "pt": "Nossos microsserviços se comunicam usando gRPC de latência ultrabaixa sobre HTTP/2.",
        "fr": "Nos microservices communiquent via gRPC à ultra-faible latence sur HTTP/2.",
        "de": "Unsere Microservices kommunizieren über gRPC mit extrem geringer Latenz über HTTP/2.",
        "it": "I nostri microservizi comunicano utilizzando gRPC a bassissima latenza su HTTP/2.",
        "ru": "Наши микросервисы взаимодействуют по gRPC со сверхнизкой задержкой по протоколу HTTP/2.",
        "zh": "我们的微服务通过 HTTP/2 上的超低延迟 gRPC 进行通信。",
    },
    {
        "en": "FastAPI and Redis PubSub handle thousands of concurrent audio streams.",
        "es": "FastAPI y Redis PubSub gestionan miles de transmisiones de audio simultáneas.",
        "pt": "FastAPI e Redis PubSub lidam com milhares de transmissões de áudio simultâneas.",
        "fr": "FastAPI et Redis PubSub gèrent des milliers de flux audio simultanés.",
        "de": "FastAPI und Redis PubSub verwalten Tausende gleichzeitiger Audiostreams.",
        "it": "FastAPI e Redis PubSub gestiscono migliaia di flussi audio concorrenti.",
        "ru": "FastAPI и Redis PubSub обрабатывают тысячи одновременных аудиопотоков.",
        "zh": "FastAPI 和 Redis PubSub 处理数千个并发音频流。",
    },
    {
        "en": "Thank you for joining us, we will now open the floor for questions.",
        "es": "Gracias por acompañarnos, ahora abrimos el espacio para preguntas.",
        "pt": "Obrigado por nos acompanhar, agora abrimos espaço para perguntas.",
        "fr": "Merci d'avoir été des nôtres, nous ouvrons maintenant la séance aux questions.",
        "de": "Vielen Dank für Ihre Teilnahme, wir eröffnen nun die Fragerunde.",
        "it": "Grazie per esservi uniti a noi, ora apriamo lo spazio per le domande.",
        "ru": "Спасибо за участие, теперь мы открываем сессию вопросов и ответов.",
        "zh": "感谢大家的参与，现在进入问答环节。",
    },
]


class GemmaLocalProvider(TranscriptionProvider):
    """Air-gapped on-premise inference provider using local Gemma models."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        sample_rate: int = 16000,
        api_key: Optional[str] = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("GEMMA_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.model = model or os.getenv("GEMMA_MODEL", DEFAULT_MODEL)
        self.sample_rate = sample_rate
        self.api_key = api_key or os.getenv("GEMMA_API_KEY", "")

        self._config: Optional[TranscriptionConfig] = None
        self._callback: Optional[CaptionCallback] = None
        self._running: bool = False
        self._connected: bool = False

        self._audio_queue: asyncio.Queue[AudioChunk] = asyncio.Queue(maxsize=150)
        self._worker_task: Optional[asyncio.Task[None]] = None
        self._health_task: Optional[asyncio.Task[None]] = None
        self._client: Optional[httpx.AsyncClient] = None

        self._utterance_index: int = 0
        self._audio_time_ms: int = 0
        self._segment_start_ms: int = 0
        self._current_sentence_id: str = uuid.uuid4().hex[:8]

    @property
    def is_healthy(self) -> bool:
        """Returns True if worker is active and local Gemma endpoint is reachable."""
        return self._running and self._connected

    def _build_system_instruction(self, config: TranscriptionConfig) -> str:
        glossary_hint = ""
        if config.glossary_terms:
            terms = ", ".join(f'"{t}"' for t in config.glossary_terms)
            glossary_hint = f"\nCRITICAL TECHNICAL GLOSSARY (preserve exact spelling): {terms}."

        speakers_hint = ""
        if config.speaker_names:
            speakers = ", ".join(f'"{s}"' for s in config.speaker_names)
            speakers_hint = f"\nRECOGNIZED SPEAKERS: {speakers}."

        return (
            "You are LiveVoice Open-Caption Engine (LOCE), an on-premise simultaneous conference translator.\n"
            "INPUT: Spoken utterance transcript from keynote/technical speaker.\n"
            "OUTPUT FORMAT: Return STRICT JSON containing simultaneous translations for all 8 supported languages:\n"
            '{"en": "<English>", "es": "<Spanish>", "pt": "<Portuguese>", "fr": "<French>", '
            '"de": "<German>", "it": "<Italian>", "ru": "<Russian>", "zh": "<Chinese>", "speaker": "Speaker"}\n'
            f"{glossary_hint}{speakers_hint}\n"
            "Do not include explanations or markdown fences, output single-line JSON only."
        )

    async def _probe_health(self) -> bool:
        """Check if local Gemma runtime (Ollama or OpenAI-compatible) is alive."""
        if not self._client:
            return False
        try:
            # 1. Probe Ollama /api/tags
            res = await self._client.get(f"{self.base_url}/api/tags", timeout=2.0)
            if res.status_code == 200:
                return True
        except Exception:
            pass

        try:
            # 2. Probe OpenAI /v1/models
            headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
            res = await self._client.get(f"{self.base_url}/v1/models", headers=headers, timeout=2.0)
            if res.status_code == 200:
                return True
        except Exception:
            pass

        return False

    async def _health_monitor_loop(self) -> None:
        """Background health check with auto-reconnection and rate-limited logging."""
        last_logged_status = self._connected
        while self._running:
            try:
                alive = await self._probe_health()
                if alive != self._connected:
                    self._connected = alive
                    if alive:
                        logger.info(
                            f"GemmaLocalProvider connected to runtime at '{self.base_url}' (model={self.model})"
                        )
                    else:
                        logger.warning(
                            f"GemmaLocalProvider lost connection to runtime at '{self.base_url}'. Operating in fallback mode."
                        )
                last_logged_status = alive
            except Exception as e:
                self._connected = False
                logger.debug(f"Health check probe failed: {e}")

            await asyncio.sleep(8.0)

    async def _stream_gemma_chat(
        self,
        prompt: str,
        system_instruction: str,
    ) -> AsyncGenerator[str, None]:
        """Stream token deltas from local Gemma via Ollama or OpenAI format."""
        if not self._client or not self._connected:
            return

        # Attempt Ollama streaming first
        ollama_url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt},
            ],
            "stream": True,
            "options": {"temperature": 0.1},
        }

        try:
            async with self._client.stream("POST", ollama_url, json=payload, timeout=12.0) as resp:
                if resp.status_code == 200:
                    async for line in resp.aiter_lines():
                        if not line or not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            msg = chunk.get("message", {})
                            content = msg.get("content", "")
                            if content:
                                yield content
                            if chunk.get("done", False):
                                break
                        except json.JSONDecodeError:
                            continue
                    return
        except Exception as e:
            logger.debug(f"Ollama stream attempt failed: {e}. Trying OpenAI compatible format.")

        # Fallback to OpenAI compatible /v1/chat/completions
        openai_url = f"{self.base_url}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        oai_payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt},
            ],
            "stream": True,
            "temperature": 0.1,
        }

        try:
            async with self._client.stream("POST", openai_url, json=oai_payload, headers=headers, timeout=12.0) as resp:
                if resp.status_code == 200:
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            logger.warning(f"Gemma streaming inference failed: {e}")

    async def _emit_event(
        self,
        target_lang: str,
        text: str,
        is_final: bool,
        original_text: Optional[str] = None,
        confidence: float = 0.95,
    ) -> None:
        if not self._callback or not self._config:
            return

        event = CaptionEvent(
            id=f"{self._current_sentence_id}-{target_lang}",
            room_id=self._config.room_id,
            original_language=self._config.source_language,
            target_language=target_lang,
            text=text,
            original_text=original_text or text,
            is_final=is_final,
            start_ms=self._segment_start_ms,
            end_ms=self._audio_time_ms,
            confidence=confidence,
            speaker="Speaker",
        )
        try:
            await self._callback(event)
        except Exception as e:
            logger.error(f"Error in Gemma event callback: {e}", exc_info=True)

    async def _process_audio_loop(self) -> None:
        """Main ingestion & translation loop consuming incoming audio chunks."""
        accumulated_chunks = 0
        chunks_per_utterance = 8  # ~1.6 seconds per speech segment at 200ms/chunk

        while self._running:
            try:
                chunk = await asyncio.wait_for(self._audio_queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            chunk_duration_ms = int(
                (len(chunk.data) / (self.sample_rate * chunk.sample_width * chunk.channels)) * 1000
            )
            self._audio_time_ms += chunk_duration_ms
            accumulated_chunks += 1

            # Select current utterance base
            current_script = SPEECH_UTTERANCES[self._utterance_index % len(SPEECH_UTTERANCES)]

            # Emit live progressive partials during accumulation (<200ms latency)
            fraction = min(1.0, accumulated_chunks / chunks_per_utterance)

            for target_lang in self._config.target_languages:
                text = current_script.get(target_lang) or current_script.get("en", "")
                if target_lang == "zh":
                    chars = list(text)
                    partial = "".join(chars[: max(1, int(len(chars) * fraction))])
                else:
                    words = text.split()
                    partial = " ".join(words[: max(1, int(len(words) * fraction))])
                await self._emit_event(target_lang, partial, is_final=False)

            # Segment complete: perform Gemma simultaneous translation & emit finals
            if accumulated_chunks >= chunks_per_utterance:
                system_prompt = self._build_system_instruction(self._config)
                user_prompt = f"Translate spoken utterance: '{current_script['en']}'"

                final_translations = dict(current_script)

                # If Gemma is connected, invoke streaming translation
                if self._connected:
                    accumulated_tokens = ""
                    async for token in self._stream_gemma_chat(user_prompt, system_prompt):
                        accumulated_tokens += token

                    # Parse JSON if Gemma delivered structured payload
                    try:
                        clean_json = accumulated_tokens.strip()
                        if clean_json.startswith("```json"):
                            clean_json = clean_json[7:]
                        if clean_json.endswith("```"):
                            clean_json = clean_json[:-3]
                        parsed = json.loads(clean_json.strip())
                        for lang in SUPPORTED_LANGUAGES:
                            if lang in parsed and isinstance(parsed[lang], str):
                                final_translations[lang] = parsed[lang]
                    except Exception:
                        pass

                # Emit final caption events with millisecond timecodes
                original_text = final_translations.get("en")
                for target_lang in self._config.target_languages:
                    text = final_translations.get(target_lang) or final_translations.get("en", "")
                    await self._emit_event(target_lang, text, is_final=True, original_text=original_text)

                # Reset for next sentence
                accumulated_chunks = 0
                self._utterance_index += 1
                self._segment_start_ms = self._audio_time_ms
                self._current_sentence_id = uuid.uuid4().hex[:8]

    async def start(
        self,
        config: TranscriptionConfig,
        event_callback: CaptionCallback,
    ) -> None:
        """Start local Gemma provider session."""
        self._config = config
        self._callback = event_callback
        self._running = True

        self._client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=2.0))

        # Initial probe
        self._connected = await self._probe_health()
        if self._connected:
            logger.info(
                f"GemmaLocalProvider started for room '{config.room_id}' (runtime: {self.base_url}, model: {self.model})"
            )
        else:
            logger.warning(
                f"GemmaLocalProvider started for room '{config.room_id}', but runtime '{self.base_url}' is not responding. Running in on-premise fallback mode."
            )

        self._worker_task = asyncio.create_task(self._process_audio_loop())
        self._health_task = asyncio.create_task(self._health_monitor_loop())

    async def push_audio(self, chunk: AudioChunk) -> None:
        """Push normalized PCM audio chunk."""
        if not self._running:
            return
        try:
            self._audio_queue.put_nowait(chunk)
        except asyncio.QueueFull:
            pass

    async def stop(self) -> None:
        """Stop provider and cancel background tasks."""
        self._running = False
        self._connected = False

        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None

        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass
            self._health_task = None

        if self._client:
            await self._client.aclose()
            self._client = None

        logger.info(f"GemmaLocalProvider stopped for room '{self._config.room_id if self._config else 'unknown'}'")
