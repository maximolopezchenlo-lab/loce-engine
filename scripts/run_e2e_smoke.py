"""Combined runner executing mock audio streamer and WebSocket client listener concurrently."""

import asyncio
import json
import subprocess
import sys
import time

async def run_smoke():
    print(">>> Starting WebSocket Listener in background...")
    listener_proc = await asyncio.create_subprocess_exec(
        sys.executable, "scripts/e2e_ws_listener.py", "--duration", "9.5", "--output", "e2e_listener_output.json",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Allow listener to connect
    await asyncio.sleep(0.5)

    print(">>> Starting Mock Audio Runner (main-stage & track-1 for 8.5s)...")
    runner_proc = await asyncio.create_subprocess_exec(
        sys.executable, "scripts/mock_runner.py", "--rooms", "main-stage", "track-1", "--duration", "8.5",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for both to finish
    runner_out, runner_err = await runner_proc.communicate()
    listener_out, listener_err = await listener_proc.communicate()

    print("\n--- Mock Runner Output ---")
    print(runner_out.decode("utf-8", errors="replace"))

    print("\n--- Listener Output ---")
    print(listener_out.decode("utf-8", errors="replace"))

if __name__ == "__main__":
    asyncio.run(run_smoke())
