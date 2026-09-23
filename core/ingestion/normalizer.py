"""Audio normalization, linear PCM formatting, resampling and ring-buffer chunking."""

from __future__ import annotations

import io
import math
import wave
from typing import Generator, Optional
import numpy as np

from core.engine.base import AudioChunk


class RingBuffer:
    """Byte-level FIFO ring buffer for deterministic audio frame slicing."""

    def __init__(self, capacity: int = 1024 * 1024) -> None:
        self.capacity = capacity
        self._buffer = bytearray()

    def write(self, data: bytes) -> None:
        """Append raw bytes to buffer."""
        self._buffer.extend(data)
        if len(self._buffer) > self.capacity:
            # Drop oldest bytes to prevent unbounded memory growth
            overflow = len(self._buffer) - self.capacity
            del self._buffer[:overflow]

    def read(self, num_bytes: int) -> Optional[bytes]:
        """Read exactly num_bytes if available, otherwise return None."""
        if len(self._buffer) < num_bytes:
            return None
        chunk = bytes(self._buffer[:num_bytes])
        del self._buffer[:num_bytes]
        return chunk

    def read_all(self) -> bytes:
        """Flush and return all buffered bytes."""
        data = bytes(self._buffer)
        self._buffer.clear()
        return data

    def __len__(self) -> int:
        return len(self._buffer)


class AudioNormalizer:
    """Normalizes arbitrary input audio frames into standardized 16kHz 16-bit mono PCM chunks."""

    def __init__(
        self,
        target_sample_rate: int = 16000,
        chunk_ms: int = 200,
        input_sample_rate: int = 16000,
        input_channels: int = 1,
    ) -> None:
        self.target_sample_rate = target_sample_rate
        self.chunk_ms = chunk_ms
        self.input_sample_rate = input_sample_rate
        self.input_channels = input_channels

        # Bytes per target chunk: (samples_per_sec * (chunk_ms / 1000)) * (16 bits / 8) * 1 channel
        self.bytes_per_sample = 2  # 16-bit
        self.target_chunk_samples = int(self.target_sample_rate * (self.chunk_ms / 1000.0))
        self.target_chunk_bytes = self.target_chunk_samples * self.bytes_per_sample

        self._ring_buffer = RingBuffer(capacity=self.target_chunk_bytes * 50)
        self._sequence_id = 0
        self._timestamp_ms = 0

    def process_raw_bytes(
        self,
        data: bytes,
        sample_rate: Optional[int] = None,
        channels: Optional[int] = None,
    ) -> list[AudioChunk]:
        """Normalize incoming bytes and return any full chunks ready for inference."""
        src_rate = sample_rate or self.input_sample_rate
        src_channels = channels or self.input_channels

        # Strip WAV header if present in data
        pcm_data = self._strip_wav_header(data)
        if not pcm_data:
            return []

        # Convert to 16-bit mono 16kHz
        normalized_pcm = self._resample_to_pcm16_mono(
            pcm_data=pcm_data,
            source_rate=src_rate,
            source_channels=src_channels,
            target_rate=self.target_sample_rate,
        )

        self._ring_buffer.write(normalized_pcm)

        chunks: list[AudioChunk] = []
        while True:
            raw_chunk = self._ring_buffer.read(self.target_chunk_bytes)
            if raw_chunk is None:
                break

            chunk = AudioChunk(
                data=raw_chunk,
                sample_rate=self.target_sample_rate,
                channels=1,
                sample_width=self.bytes_per_sample,
                timestamp_ms=self._timestamp_ms,
                sequence_id=self._sequence_id,
            )
            self._sequence_id += 1
            self._timestamp_ms += self.chunk_ms
            chunks.append(chunk)

        return chunks

    def flush(self) -> Optional[AudioChunk]:
        """Flush remaining buffered audio as a final partial chunk if non-empty."""
        remaining = self._ring_buffer.read_all()
        if not remaining:
            return None

        # Zero-pad remaining bytes to even 16-bit sample boundary
        if len(remaining) % self.bytes_per_sample != 0:
            remaining += b"\x00"

        chunk = AudioChunk(
            data=remaining,
            sample_rate=self.target_sample_rate,
            channels=1,
            sample_width=self.bytes_per_sample,
            timestamp_ms=self._timestamp_ms,
            sequence_id=self._sequence_id,
        )
        self._sequence_id += 1
        return chunk

    @staticmethod
    def _strip_wav_header(data: bytes) -> bytes:
        """Strip RIFF / WAVE header if present."""
        if len(data) >= 44 and data.startswith(b"RIFF") and b"WAVE" in data[:12]:
            try:
                with io.BytesIO(data) as bio:
                    with wave.open(bio, "rb") as wf:
                        return wf.readframes(wf.getnframes())
            except Exception:
                # If header parsing fails, strip standard 44-byte header
                return data[44:]
        return data

    @staticmethod
    def _resample_to_pcm16_mono(
        pcm_data: bytes,
        source_rate: int,
        source_channels: int,
        target_rate: int,
    ) -> bytes:
        """Convert multi-channel/arbitrary rate 16-bit PCM to single-channel target rate."""
        # Convert bytes to numpy int16
        audio_array = np.frombuffer(pcm_data, dtype=np.int16)
        if len(audio_array) == 0:
            return b""

        # Downmix stereo/multichannel to mono by averaging
        if source_channels > 1:
            # Truncate to clean multiple of channel count
            rem = len(audio_array) % source_channels
            if rem != 0:
                audio_array = audio_array[:-rem]
            if len(audio_array) == 0:
                return b""
            reshaped = audio_array.reshape(-1, source_channels)
            audio_array = reshaped.mean(axis=1).astype(np.int16)

        # Resample if source_rate != target_rate
        if source_rate != target_rate and len(audio_array) > 0:
            new_length = int(round(len(audio_array) * float(target_rate) / float(source_rate)))
            if new_length <= 0:
                return b""
            # High-speed linear interpolation for low-latency streaming
            old_indices = np.linspace(0, len(audio_array) - 1, num=len(audio_array))
            new_indices = np.linspace(0, len(audio_array) - 1, num=new_length)
            audio_array = np.interp(new_indices, old_indices, audio_array).astype(np.int16)

        return audio_array.tobytes()

    @staticmethod
    def compute_rms(pcm_data: bytes) -> float:
        """Calculate Root Mean Square (RMS) energy to detect silence."""
        audio_array = np.frombuffer(pcm_data, dtype=np.int16)
        if len(audio_array) == 0:
            return 0.0
        return float(np.sqrt(np.mean(np.square(audio_array.astype(np.float64)))))
