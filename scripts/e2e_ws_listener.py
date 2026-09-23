"""Auxiliary WebSocket listener for LOCE E2E smoke tests.

Connects to multiple room streams concurrently, recording incoming partial
and final subtitle events.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
import websockets


async def listen_room(
    room_id: str,
    lang: str,
    duration_sec: float,
    results: dict,
) -> None:
    uri = f"ws://127.0.0.1:8000/ws/stream/{room_id}?lang={lang}&mode=all"
    stats = {
        "room_id": room_id,
        "lang": lang,
        "partials": 0,
        "finals": 0,
        "sample_partials": [],
        "sample_finals": [],
        "connected": False,
    }
    results[room_id] = stats

    try:
        async with websockets.connect(uri) as ws:
            stats["connected"] = True
            start_time = time.time()

            while (time.time() - start_time) < duration_sec:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    msg = json.loads(raw)
                    msg_type = msg.get("type")

                    if msg_type == "caption":
                        data = msg.get("data", {})
                        is_final = data.get("is_final", False)
                        text = data.get("text", "")
                        speaker = data.get("speaker")

                        entry = f"[{speaker or 'Speaker'}] {text}"
                        if is_final:
                            stats["finals"] += 1
                            if len(stats["sample_finals"]) < 3:
                                stats["sample_finals"].append(entry)
                        else:
                            stats["partials"] += 1
                            if len(stats["sample_partials"]) < 3:
                                stats["sample_partials"].append(entry)

                except asyncio.TimeoutError:
                    continue

    except Exception as e:
        stats["error"] = str(e)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=9.0)
    parser.add_argument("--output", type=str, default="e2e_listener_output.json")
    args = parser.parse_args()

    results: dict = {}
    await asyncio.gather(
        listen_room("main-stage", "es", args.duration, results),
        listen_room("track-1", "en", args.duration, results),
    )

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
