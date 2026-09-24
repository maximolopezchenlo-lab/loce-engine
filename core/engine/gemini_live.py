"""Production-grade Gemini Live Multimodal Bidirectional WebSocket Provider.

Connects to Google's BidiGenerateContent endpoint via full-duplex WebSocket,
streaming raw PCM audio frames and parsing real-time simultaneous transcription
and translation text deltas.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import uuid
from typing import Optional
import websockets
try:
    from websockets.asyncio.client import ClientConnection as WebSocketClientProtocol
except ImportError:
    from websockets.client import WebSocketClientProtocol

from core.engine.base import (
    AudioChunk,
    CaptionCallback,
    CaptionEvent,
    SUPPORTED_LANGUAGES,
    TranscriptionConfig,
    TranscriptionProvider,
)

logger = logging.getLogger("loce.gemini_live")

GEMINI_LIVE_HOST = "generativelanguage.googleapis.com"
GEMINI_LIVE_PATH = "/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
DEFAULT_MODEL = "models/gemini-3.5-transcribe-live"


class GeminiLiveProvider(TranscriptionProvider):
    """Real-time streaming speech-to-text and translation via Gemini Live WebSocket API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        sample_rate: int = 16000,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.model = model
        self.sample_rate = sample_rate

        self._config: Optional[TranscriptionConfig] = None
        self._callback: Optional[CaptionCallback] = None
        self._running: bool = False
        self._ws: Optional[WebSocketClientProtocol] = None

        self._audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=100)
        self._sender_task: Optional[asyncio.Task[None]] = None
        self._receiver_task: Optional[asyncio.Task[None]] = None

        self._current_sentence_id: str = uuid.uuid4().hex[:8]
        self._partial_buffers: dict[str, str] = {lang: "" for lang in SUPPORTED_LANGUAGES}
        self._audio_time_ms: int = 0
        self._segment_start_ms: int = 0

    def _is_connected(self) -> bool:
        if self._ws is None:
            return False
        state = getattr(self._ws, "state", None)
        if state is not None:
            return getattr(state, "name", "") == "OPEN"
        return not getattr(self._ws, "closed", True)

    @property
    def is_healthy(self) -> bool:
        return (
            self._running
            and self._is_connected()
            and (self._receiver_task is not None and not self._receiver_task.done())
        )

    def _build_system_instruction(self, config: TranscriptionConfig) -> str:
        glossary_hint = ""
        if config.glossary_terms:
            terms_joined = ", ".join(f'"{t}"' for t in config.glossary_terms)
            glossary_hint = (
                f"\nCRITICAL TECHNICAL GLOSSARY: Always prioritize accurate spelling of these terms: {terms_joined}."
            )

        speakers_hint = ""
        if config.speaker_names:
            speakers_joined = ", ".join(f'"{s}"' for s in config.speaker_names)
            speakers_hint = f"\nRECOGNIZED SPEAKERS: {speakers_joined}."

        return (
            "You are LiveVoice Open-Caption Engine (LOCE), an ultra-low latency conference captioner and translator.\n"
            "INPUT: Continuous streaming speech audio in any supported conference language.\n"
            "OUTPUT FORMAT: For every spoken phrase, you MUST output a single-line JSON object per completed or ongoing thought:\n"
            '{"en": "<English transcript>", "es": "<Spanish translation>", "pt": "<Portuguese translation>", '
            '"fr": "<French translation>", "de": "<German translation>", "it": "<Italian translation>", '
            '"ru": "<Russian translation>", "zh": "<Chinese translation>", "speaker": "<Identified speaker or Speaker>"}\n'
            "Strict guidelines:\n"
            "1. Output immediately with minimal latency (<500ms).\n"
            "2. Preserve technical precision, code keywords, and acronyms.\n"
            "3. Do not add conversational commentary or filler text.\n"
            f"{glossary_hint}{speakers_hint}"
        )

    async def start(
        self,
        config: TranscriptionConfig,
        event_callback: CaptionCallback,
    ) -> None:
        if not self.api_key:
            raise ValueError(
                "GEMINI_API_KEY is required for GeminiLiveProvider. "
                "Set it in the environment or pass it explicitly, or use MockStreamingProvider."
            )

        self._config = config
        self._callback = event_callback
        self._running = True
        self._current_sentence_id = uuid.uuid4().hex[:8]
        self._audio_time_ms = 0
        self._segment_start_ms = 0
        self._partial_buffers = {lang: "" for lang in SUPPORTED_LANGUAGES}

        # Connect to BidiGenerateContent WebSocket
        uri = f"wss://{GEMINI_LIVE_HOST}{GEMINI_LIVE_PATH}?key={self.api_key}"
        try:
            self._ws = await websockets.connect(
                uri,
                ping_interval=15,
                ping_timeout=10,
                max_size=10 * 1024 * 1024,
            )

            # 1. Send Handshake Setup message
            setup_payload = {
                "setup": {
                    "model": self.model,
                    "generationConfig": {
                        "responseModalities": ["TEXT"],
                        "temperature": 0.1,
                    },
                    "systemInstruction": {
                        "parts": [{"text": self._build_system_instruction(config)}]
                    },
                }
            }
            await self._ws.send(json.dumps(setup_payload))
            logger.info("Sent Gemini Live Setup payload. Awaiting setupComplete...")

            # 2. Receive setup confirmation
            initial_msg = await self._ws.recv()
            setup_resp = json.loads(initial_msg)
            if "setupComplete" not in setup_resp:
                logger.warning(f"Unexpected initial response from Gemini Live: {setup_resp}")
            else:
                logger.info("Gemini Live setupComplete handshake established.")
        except Exception as e:
            logger.warning(f"Gemini Live connection/handshake failed for room '{config.room_id}': {e}. Provider marked unhealthy.")
            self._healthy = False
            self._running = False
            if self._ws:
                try:
                    await self._ws.close()
                except Exception:
                    pass
                self._ws = None
            return

        # 3. Launch background send/receive loops
        self._sender_task = asyncio.create_task(
            self._send_loop(),
            name=f"gemini-send-{config.room_id}",
        )
        self._receiver_task = asyncio.create_task(
            self._receive_loop(),
            name=f"gemini-recv-{config.room_id}",
        )

    async def push_audio(self, chunk: AudioChunk) -> None:
        if not self._running:
            return

        # Calculate audio timestamp progression
        bytes_per_sec = chunk.sample_rate * chunk.channels * chunk.sample_width
        if bytes_per_sec > 0:
            duration_ms = int((len(chunk.data) / bytes_per_sec) * 1000)
            self._audio_time_ms += duration_ms

        try:
            self._audio_queue.put_nowait(chunk.data)
        except asyncio.QueueFull:
            # Drop oldest audio chunk to prevent buffer bloat under backpressure
            try:
                self._audio_queue.get_nowait()
                self._audio_queue.put_nowait(chunk.data)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass

    async def _send_loop(self) -> None:
        """Stream realtimeInput audio chunks to Gemini Live WebSocket."""
        mime_type = f"audio/pcm;rate={self.sample_rate}"
        try:
            while self._running and self._is_connected():
                try:
                    data = await asyncio.wait_for(self._audio_queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    continue

                b64_data = base64.b64encode(data).decode("ascii")
                realtime_msg = {
                    "realtimeInput": {
                        "mediaChunks": [
                            {
                                "mimeType": mime_type,
                                "data": b64_data,
                            }
                        ]
                    }
                }
                if self._ws:
                    await self._ws.send(json.dumps(realtime_msg))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in Gemini send loop: {e}", exc_info=True)

    async def _receive_loop(self) -> None:
        """Receive streaming text tokens from Gemini Live and emit CaptionEvents."""
        try:
            while self._running and self._is_connected() and self._ws:
                msg_raw = await self._ws.recv()
                msg = json.loads(msg_raw)

                server_content = msg.get("serverContent")
                if not server_content:
                    continue

                model_turn = server_content.get("modelTurn")
                turn_complete = server_content.get("turnComplete", False)

                if model_turn:
                    for part in model_turn.get("parts", []):
                        text = part.get("text", "")
                        if text:
                            await self._handle_text_delta(text, turn_complete)

                if turn_complete:
                    await self._commit_turn_final()

        except asyncio.CancelledError:
            pass
        except websockets.exceptions.ConnectionClosed as cc:
            logger.warning(f"Gemini Live WebSocket closed: {cc}")
        except Exception as e:
            logger.error(f"Error in Gemini receive loop: {e}", exc_info=True)

    async def _handle_text_delta(self, raw_text: str, is_turn_complete: bool) -> None:
        """Parse streaming text delta, update progressive partials, and dispatch."""
        if not self._callback or not self._config:
            return

        # Attempt JSON or structured line extraction
        lang_texts, speaker = self._parse_caption_text(raw_text)

        for lang, text_delta in lang_texts.items():
            if text_delta:
                current = self._partial_buffers.get(lang, "")
                # Avoid space separation for Chinese ideograms if needed
                sep = "" if lang == "zh" or not current else " "
                self._partial_buffers[lang] = f"{current}{sep}{text_delta}"

        # Emit partial updates to subscribed viewers
        for target_lang in self._config.target_languages:
            display_text = self._partial_buffers.get(target_lang) or self._partial_buffers.get("en", "")
            if not display_text:
                continue

            event = CaptionEvent(
                id=f"partial-{self._current_sentence_id}",
                room_id=self._config.room_id,
                original_language=self._config.source_language,
                target_language=target_lang,
                text=display_text,
                original_text=self._partial_buffers.get("en") or None,
                is_final=False,
                start_ms=self._segment_start_ms,
                end_ms=self._audio_time_ms,
                confidence=0.92,
                speaker=speaker,
            )
            await self._callback(event)

    async def _commit_turn_final(self) -> None:
        """Commit finalized caption segment and reset turn buffers."""
        if not self._callback or not self._config:
            return

        final_id = f"final-{self._current_sentence_id}-{uuid.uuid4().hex[:6]}"

        for target_lang in self._config.target_languages:
            display_text = self._partial_buffers.get(target_lang) or self._partial_buffers.get("en", "")
            if not display_text:
                continue

            event = CaptionEvent(
                id=final_id,
                room_id=self._config.room_id,
                original_language=self._config.source_language,
                target_language=target_lang,
                text=display_text,
                original_text=self._partial_buffers.get("en") or None,
                is_final=True,
                start_ms=self._segment_start_ms,
                end_ms=self._audio_time_ms,
                confidence=0.97,
            )
            await self._callback(event)

        # Rotate sentence ID and reset buffers for next utterance
        self._current_sentence_id = uuid.uuid4().hex[:8]
        self._segment_start_ms = self._audio_time_ms
        self._partial_buffers = {lang: "" for lang in SUPPORTED_LANGUAGES}

    def _parse_caption_text(self, raw: str) -> tuple[dict[str, str], Optional[str]]:
        """Extract multi-language text and optional speaker from model emission."""
        raw_clean = raw.strip()
        # Case 1: Model returned clean JSON line
        if raw_clean.startswith("{") and raw_clean.endswith("}"):
            try:
                data = json.loads(raw_clean)
                speaker = data.get("speaker")
                lang_map: dict[str, str] = {}
                for lang in SUPPORTED_LANGUAGES:
                    if lang in data and isinstance(data[lang], str):
                        lang_map[lang] = data[lang]
                return lang_map, speaker
            except Exception:
                pass

        # Case 2: Plain text output
        return {lang: raw_clean for lang in SUPPORTED_LANGUAGES}, None

    async def stop(self) -> None:
        self._running = False
        if self._sender_task and not self._sender_task.done():
            self._sender_task.cancel()
        if self._receiver_task and not self._receiver_task.done():
            self._receiver_task.cancel()

        if self._ws and self._is_connected():
            await self._ws.close()

        logger.info("GeminiLiveProvider terminated.")
