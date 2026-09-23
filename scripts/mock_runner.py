"""Concurrent Mock Audio Runner for LiveVoice Open-Caption Engine (LOCE).

Simulates concurrent live speaker audio streams to multiple conference rooms
in parallel via WebSocket PCM ingestion.
"""

from __future__ import annotations

import argparse
import asyncio
import math
import struct
import sys
import time
import wave
from pathlib import Path
import websockets


def generate_audio_frame(
    num_samples: int,
    sample_rate: int = 16000,
    frequency: float = 440.0,
    time_offset: float = 0.0,
) -> bytes:
    """Generate simulated PCM 16-bit mono speech frame."""
    frames = bytearray()
    for i in range(num_samples):
        t = time_offset + (i / sample_rate)
        # Modulated synthetic signal
        amp = 0.4 * math.sin(2 * math.pi * frequency * t) * (0.8 + 0.2 * math.sin(2 * math.pi * 4 * t))
        val = int(amp * 32767.0)
        frames.extend(struct.pack("<h", max(-32768, min(32767, val))))
    return bytes(frames)


async def stream_to_room(
    room_id: str,
    server_url: str,
    audio_path: Path | None,
    duration_sec: float,
    chunk_ms: int = 200,
    sample_rate: int = 16000,
) -> None:
    """Stream audio frames to a single room over WebSocket at 1x real-time speed."""
    ws_uri = f"{server_url}/ws/ingest/{room_id}?sample_rate={sample_rate}&channels=1"
    samples_per_chunk = int(sample_rate * (chunk_ms / 1000.0))
    bytes_per_chunk = samples_per_chunk * 2  # 16-bit mono

    # Load audio file if provided
    wav_bytes = None
    if audio_path and audio_path.exists():
        try:
            with wave.open(str(audio_path), "rb") as wf:
                wav_bytes = wf.readframes(wf.getnframes())
                print(f"[{room_id}] Loaded {len(wav_bytes)} bytes from {audio_path.name}")
        except Exception as e:
            print(f"[{room_id}] Could not parse WAV: {e}. Falling back to synthetic tone.")

    print(f"[{room_id}] Connecting to {ws_uri}...")
    try:
        async with websockets.connect(ws_uri) as ws:
            print(f"[{room_id}] Connected. Streaming audio for {duration_sec}s (chunk_ms={chunk_ms})...")

            start_time = time.time()
            bytes_sent = 0
            offset = 0

            while (time.time() - start_time) < duration_sec:
                loop_start = time.time()

                if wav_bytes:
                    chunk = wav_bytes[offset : offset + bytes_per_chunk]
                    if len(chunk) < bytes_per_chunk:
                        # Loop playback
                        offset = 0
                        chunk = wav_bytes[offset : offset + bytes_per_chunk]
                    offset += bytes_per_chunk
                else:
                    t_offset = time.time() - start_time
                    freq = 440.0 if "1" in room_id or "main" in room_id else 520.0
                    chunk = generate_audio_frame(
                        num_samples=samples_per_chunk,
                        sample_rate=sample_rate,
                        frequency=freq,
                        time_offset=t_offset,
                    )

                await ws.send(chunk)
                bytes_sent += len(chunk)

                # Real-time cadence sleep
                elapsed = time.time() - loop_start
                sleep_target = (chunk_ms / 1000.0) - elapsed
                if sleep_target > 0:
                    await asyncio.sleep(sleep_target)

            print(f"[{room_id}] Stream complete! Sent {bytes_sent} bytes ({bytes_sent / (sample_rate * 2):.1f}s of audio).")

    except Exception as e:
        print(f"[{room_id}] Connection error: {e}", file=sys.stderr)


async def main() -> None:
    parser = argparse.ArgumentParser(description="LOCE Concurrent Mock Audio Runner")
    parser.add_argument(
        "--rooms",
        nargs="+",
        default=["main-stage", "track-1"],
        help="List of room IDs to stream to concurrently (default: main-stage track-1)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="LOCE server host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="LOCE server port (default: 8000)",
    )
    parser.add_argument(
        "--audio",
        type=str,
        default="fixtures/sample_tech_talk.wav",
        help="Path to WAV audio file (optional)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=6.0,
        help="Duration in seconds to stream (default: 6.0)",
    )
    parser.add_argument(
        "--chunk-ms",
        type=int,
        default=200,
        help="Audio frame size in milliseconds (default: 200)",
    )

    args = parser.parse_args()
    server_url = f"ws://{args.host}:{args.port}"
    audio_path = Path(args.audio) if args.audio else None

    print("=" * 60)
    print("LOCE CONCURRENT MOCK AUDIO RUNNER")
    print(f"Target Server : {server_url}")
    print(f"Active Rooms  : {args.rooms} (Total: {len(args.rooms)} concurrent streams)")
    print(f"Duration      : {args.duration}s per room")
    print(f"Audio Source  : {audio_path or 'Synthetic Modulated Sine'}")
    print("=" * 60)

    tasks = [
        stream_to_room(
            room_id=room,
            server_url=server_url,
            audio_path=audio_path,
            duration_sec=args.duration,
            chunk_ms=args.chunk_ms,
        )
        for room in args.rooms
    ]

    await asyncio.gather(*tasks)
    print("\nAll concurrent streams finished successfully.")


if __name__ == "__main__":
    asyncio.run(main())
