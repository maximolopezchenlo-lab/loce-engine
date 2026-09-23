"""Tests for audio normalization, ring-buffering and PCM resampling."""

import numpy as np
import pytest
from core.ingestion.normalizer import AudioNormalizer, RingBuffer


def test_ring_buffer_read_write():
    rb = RingBuffer(capacity=100)
    rb.write(b"abcdefgh")
    assert len(rb) == 8

    chunk = rb.read(4)
    assert chunk == b"abcd"
    assert len(rb) == 4

    # Not enough data for 10 bytes
    assert rb.read(10) is None

    # Read remaining
    remaining = rb.read_all()
    assert remaining == b"efgh"
    assert len(rb) == 0


def test_ring_buffer_capacity_eviction():
    rb = RingBuffer(capacity=10)
    rb.write(b"0123456789")
    assert len(rb) == 10

    # Write 5 more bytes -> earliest 5 should be evicted
    rb.write(b"ABCDE")
    assert len(rb) == 10
    assert rb.read_all() == b"56789ABCDE"


def test_audio_normalizer_chunking():
    # 16000 Hz, 16-bit mono -> 2 bytes per sample.
    # 200ms chunk = 16000 * 0.2 = 3200 samples = 6400 bytes.
    normalizer = AudioNormalizer(
        target_sample_rate=16000,
        chunk_ms=200,
        input_sample_rate=16000,
        input_channels=1,
    )

    # 12800 bytes = exactly two 200ms chunks
    test_pcm = b"\x00\x01" * 6400
    chunks = normalizer.process_raw_bytes(test_pcm)

    assert len(chunks) == 2
    assert chunks[0].sample_rate == 16000
    assert chunks[0].channels == 1
    assert chunks[0].sample_width == 2
    assert len(chunks[0].data) == 6400
    assert chunks[0].sequence_id == 0
    assert chunks[1].sequence_id == 1
    assert chunks[1].timestamp_ms == 200


def test_audio_normalizer_stereo_to_mono():
    # Input stereo 16kHz
    normalizer = AudioNormalizer(
        target_sample_rate=16000,
        chunk_ms=100,
        input_sample_rate=16000,
        input_channels=2,
    )

    # 100ms chunk at 16kHz mono = 1600 samples = 3200 bytes
    # Input stereo needs 3200 stereo frames = 6400 samples = 12800 bytes
    stereo_data = np.full((3200, 2), 1000, dtype=np.int16).tobytes()
    chunks = normalizer.process_raw_bytes(stereo_data)

    assert len(chunks) == 2
    assert len(chunks[0].data) == 3200
    # Values should be average of (1000, 1000) = 1000
    arr = np.frombuffer(chunks[0].data, dtype=np.int16)
    assert arr[0] == 1000


def test_audio_normalizer_resampling():
    # Input 8000 Hz -> Target 16000 Hz
    normalizer = AudioNormalizer(
        target_sample_rate=16000,
        chunk_ms=200,
        input_sample_rate=8000,
        input_channels=1,
    )

    # 8000 Hz, 200ms = 1600 samples = 3200 bytes
    input_pcm = b"\x10\x00" * 1600
    chunks = normalizer.process_raw_bytes(input_pcm)

    assert len(chunks) == 1
    # 16000 Hz, 200ms = 3200 samples = 6400 bytes
    assert len(chunks[0].data) == 6400


def test_compute_rms():
    # Pure silence = 0 RMS
    silence = b"\x00" * 1000
    assert AudioNormalizer.compute_rms(silence) == 0.0

    # Signal
    sig = np.full(500, 1000, dtype=np.int16).tobytes()
    rms = AudioNormalizer.compute_rms(sig)
    assert pytest.approx(rms, 0.1) == 1000.0
