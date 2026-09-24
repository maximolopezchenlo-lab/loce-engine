"""High-Concurrency Multi-Room Benchmark & Stress Test for LOCE.

Tests 30+ concurrent stages in parallel with global multilingual streams
(EN, ES, PT, FR, DE, IT, RU, ZH), measuring real-time throughput, event delivery,
and P50/P95/P99 latency percentiles across simultaneous WebSocket connections.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
import math
import struct
import sys
import time
from typing import Dict, List, Optional
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
        amp = 0.4 * math.sin(2 * math.pi * frequency * t) * (0.8 + 0.2 * math.sin(2 * math.pi * 4 * t))
        val = int(amp * 32767.0)
        frames.extend(struct.pack("<h", max(-32768, min(32767, val))))
    return bytes(frames)


class StageMetrics:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.bytes_sent = 0
        self.chunks_sent = 0
        self.ingest_connected = False
        self.ingest_error: Optional[str] = None

        # Captions received per language: {"es": 0, "en": 0, "pt": 0, "zh": 0, "ru": 0}
        self.partials: Dict[str, int] = {}
        self.finals: Dict[str, int] = {}
        self.latencies_ms: List[float] = []
        self.viewer_errors: List[str] = []
        self.sample_texts: List[str] = []


async def ingest_worker(
    room_id: str,
    server_ws_url: str,
    duration_sec: float,
    chunk_ms: int,
    sample_rate: int,
    metrics: StageMetrics,
) -> None:
    """Push 16kHz PCM audio stream to a single room at real-time cadence."""
    uri = f"{server_ws_url}/ws/ingest/{room_id}?sample_rate={sample_rate}&channels=1"
    samples_per_chunk = int(sample_rate * (chunk_ms / 1000.0))
    bytes_per_chunk = samples_per_chunk * 2
    freq = 300.0 + (hash(room_id) % 300)

    try:
        async with websockets.connect(uri) as ws:
            metrics.ingest_connected = True
            start_time = time.time()
            seq = 0

            while (time.time() - start_time) < duration_sec:
                loop_start = time.time()
                t_offset = loop_start - start_time

                chunk = generate_audio_frame(
                    num_samples=samples_per_chunk,
                    sample_rate=sample_rate,
                    frequency=freq,
                    time_offset=t_offset,
                )
                await ws.send(chunk)
                metrics.bytes_sent += len(chunk)
                metrics.chunks_sent += 1
                seq += 1

                elapsed = time.time() - loop_start
                sleep_target = (chunk_ms / 1000.0) - elapsed
                if sleep_target > 0:
                    await asyncio.sleep(sleep_target)

    except Exception as e:
        metrics.ingest_error = str(e)


async def viewer_worker(
    room_id: str,
    lang: str,
    server_ws_url: str,
    duration_sec: float,
    metrics: StageMetrics,
) -> None:
    """Subscribe to /ws/stream/{room_id} for a specific language and collect metrics."""
    uri = f"{server_ws_url}/ws/stream/{room_id}?lang={lang}&mode=all"

    try:
        async with websockets.connect(uri) as ws:
            start_time = time.time()
            # Wait up to duration + grace margin for all emitted events
            while (time.time() - start_time) < (duration_sec + 4.0):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    recv_time = time.time()
                    msg = json.loads(raw)

                    if msg.get("type") == "caption":
                        data = msg.get("data", {})
                        is_final = data.get("is_final", False)
                        target_lang = data.get("target_language", lang)
                        text = data.get("text", "")
                        ts_iso = data.get("timestamp_iso")

                        if ts_iso:
                            try:
                                dt = datetime.fromisoformat(ts_iso)
                                ts_epoch = dt.timestamp()
                                lat_ms = max(0.0, (recv_time - ts_epoch) * 1000.0)
                                metrics.latencies_ms.append(lat_ms)
                            except Exception:
                                pass

                        if is_final:
                            metrics.finals[target_lang] = metrics.finals.get(target_lang, 0) + 1
                            if len(metrics.sample_texts) < 2 and text:
                                metrics.sample_texts.append(f"[{target_lang.upper()}] {text}")
                        else:
                            metrics.partials[target_lang] = metrics.partials.get(target_lang, 0) + 1

                except asyncio.TimeoutError:
                    if (time.time() - start_time) >= (duration_sec + 3.0):
                        break
                    continue


    except Exception as e:
        metrics.viewer_errors.append(f"{lang}: {e}")


def calculate_percentiles(values: List[float]) -> tuple[float, float, float]:
    """Calculate P50, P95, P99 from a list of latencies in ms."""
    if not values:
        return 0.0, 0.0, 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)

    def _p(p: float) -> float:
        idx = int(math.ceil((p / 100.0) * n)) - 1
        return sorted_vals[max(0, min(n - 1, idx))]

    return _p(50), _p(95), _p(99)


async def run_benchmark(
    num_rooms: int = 32,
    duration_sec: float = 12.0,
    host: str = "127.0.0.1",
    port: int = 8000,
    chunk_ms: int = 200,
    sample_rate: int = 16000,
    langs: Optional[List[str]] = None,
) -> None:
    test_langs = langs or ["es", "en", "pt", "zh", "ru"]
    server_ws_url = f"ws://{host}:{port}"
    room_ids = [f"stage-{i+1}" for i in range(num_rooms)]
    metrics_map: Dict[str, StageMetrics] = {r: StageMetrics(r) for r in room_ids}

    total_connections = num_rooms + (num_rooms * len(test_langs))

    print("\n" + "=" * 96)
    print(f"🚀 LOCE HIGH-CONCURRENCY MULTI-ROOM BENCHMARK (NERDEARLA SCALE)")
    print(f"   Target Server  : {server_ws_url}")
    print(f"   Rooms/Stages   : {num_rooms} concurrent ({room_ids[0]} ... {room_ids[-1]})")
    print(f"   Languages      : {', '.join(l.upper() for l in test_langs)} ({len(test_langs)} listeners per stage)")
    print(f"   Duration       : {duration_sec}s per stage")
    print(f"   Audio Spec     : 16kHz PCM 16-bit mono ({chunk_ms}ms frames)")
    print(f"   Total Streams  : {num_rooms} Ingest WS + {num_rooms * len(test_langs)} Viewer WS = {total_connections} active WebSockets")
    print("=" * 96 + "\n")

    # 1. Start multilingual viewers first
    viewer_tasks = []
    for r in room_ids:
        for lang in test_langs:
            viewer_tasks.append(
                asyncio.create_task(
                    viewer_worker(
                        room_id=r,
                        lang=lang,
                        server_ws_url=server_ws_url,
                        duration_sec=duration_sec,
                        metrics=metrics_map[r],
                    )
                )
            )

    # Allow viewers to establish connections
    await asyncio.sleep(1.0)

    # 2. Start audio ingest workers simultaneously across all rooms
    ingest_tasks = [
        asyncio.create_task(
            ingest_worker(
                room_id=r,
                server_ws_url=server_ws_url,
                duration_sec=duration_sec,
                chunk_ms=chunk_ms,
                sample_rate=sample_rate,
                metrics=metrics_map[r],
            )
        )
        for r in room_ids
    ]

    benchmark_start = time.time()
    print(f"[*] Ingesting audio to all {num_rooms} stages simultaneously...")
    await asyncio.gather(*ingest_tasks)
    print(f"[*] Ingest completed. Collecting remaining dispatched captions...")
    await asyncio.gather(*viewer_tasks)
    total_benchmark_time = time.time() - benchmark_start

    # 3. Compile and print results table
    print("\n" + "=" * 96)
    print("📊 MULTI-STAGE CONCURRENT PERFORMANCE MATRIX")
    print("=" * 96)
    header = f"{'STAGE':<10} | {'AUDIO (KB)':<10} | {'PARTIALS':<12} | {'FINALS':<10} | {'P50 (ms)':<9} | {'P95 (ms)':<9} | {'STATUS':<8}"
    print(header)
    print("-" * 96)

    all_latencies: List[float] = []
    total_audio_bytes = 0
    total_partials = 0
    total_finals = 0
    healthy_stages = 0
    lang_finals_agg: Dict[str, int] = {l: 0 for l in test_langs}

    for room_id in room_ids:
        m = metrics_map[room_id]
        total_audio_bytes += m.bytes_sent
        all_latencies.extend(m.latencies_ms)

        part_count = sum(m.partials.values())
        fin_count = sum(m.finals.values())
        total_partials += part_count
        total_finals += fin_count

        for l in test_langs:
            lang_finals_agg[l] += m.finals.get(l, 0)

        p50, p95, _ = calculate_percentiles(m.latencies_ms)
        kb_sent = m.bytes_sent / 1024.0

        is_healthy = m.ingest_connected and (fin_count > 0)
        if is_healthy:
            healthy_stages += 1
            status_label = "✅ PASS"
        else:
            status_label = "❌ FAIL"

        print(
            f"{room_id:<10} | {kb_sent:>8.1f}KB | {part_count:>12} | {fin_count:>10} | {p50:>7.2f}ms | {p95:>7.2f}ms | {status_label:<8}"
        )

    print("-" * 96)
    overall_p50, overall_p95, overall_p99 = calculate_percentiles(all_latencies)
    throughput_kb_s = (total_audio_bytes / 1024.0) / max(0.1, total_benchmark_time)
    events_per_sec = (total_partials + total_finals) / max(0.1, total_benchmark_time)
    success_rate = (healthy_stages / max(1, num_rooms)) * 100.0

    print(f"\n📈 OVERALL AGGREGATED METRICS:")
    print(f"  • Concurrent Rooms Tested   : {num_rooms}")
    print(f"  • Active WebSocket Channels : {total_connections} simultaneous connections")
    print(f"  • Duration                  : {total_benchmark_time:.2f}s total run")
    print(f"  • Audio Ingestion Throughput: {throughput_kb_s:.2f} KB/s ({total_audio_bytes / 1024.0:.1f} KB total)")
    print(f"  • Caption Event Throughput  : {events_per_sec:.1f} events/s ({total_partials} partials, {total_finals} finals)")
    print(f"  • Finals by Language        : " + ", ".join(f"{l.upper()}={lang_finals_agg[l]}" for l in test_langs))
    print(f"  • P50 End-to-End Latency    : {overall_p50:.2f} ms")
    print(f"  • P95 End-to-End Latency    : {overall_p95:.2f} ms")
    print(f"  • P99 End-to-End Latency    : {overall_p99:.2f} ms")
    print(f"  • Multi-Room Success Rate   : {success_rate:.1f}% ({healthy_stages}/{num_rooms} stages passing)")

    # Sample Multilingual Verifications
    print("\n📝 SAMPLE DISPATCHED CAPTIONS (VERIFY MULTILINGUAL ACCURACY):")
    for room_id in room_ids[:2]:
        sample_stage = metrics_map[room_id]
        print(f"  [{room_id}]")
        for s in sample_stage.sample_texts[:4]:
            print(f"    {s}")
    print("=" * 96 + "\n")

    if healthy_stages < num_rooms:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LOCE Concurrency & Latency Stress Test")
    parser.add_argument("--rooms", type=int, default=32, help="Number of concurrent stages (default: 32)")
    parser.add_argument("--duration", type=float, default=12.0, help="Duration in seconds (default: 12.0)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Server host")
    parser.add_argument("--port", type=int, default=8000, help="Server port")
    parser.add_argument("--chunk-ms", type=int, default=200, help="Chunk size in ms")
    parser.add_argument("--sample-rate", type=int, default=16000, help="Sample rate in Hz")
    parser.add_argument(
        "--langs",
        type=str,
        default="es,en,pt,zh,ru",
        help="Comma-separated target languages (default: es,en,pt,zh,ru)",
    )

    args = parser.parse_args()
    langs_list = [l.strip().lower() for l in args.langs.split(",") if l.strip()]
    asyncio.run(
        run_benchmark(
            num_rooms=args.rooms,
            duration_sec=args.duration,
            host=args.host,
            port=args.port,
            chunk_ms=args.chunk_ms,
            sample_rate=args.sample_rate,
            langs=langs_list,
        )
    )
