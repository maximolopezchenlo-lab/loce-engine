"""Generate synthetic 16kHz 16-bit mono WAV test audio fixture."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


def generate_test_wav(
    filepath: Path,
    duration_sec: float = 3.0,
    sample_rate: int = 16000,
    frequency: float = 440.0,
) -> Path:
    """Generate a clean synthetic sine wave PCM audio file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    num_samples = int(duration_sec * sample_rate)

    with wave.open(str(filepath), "wb") as wf:
        wf.setnchannels(1)  # Mono
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)

        frames = bytearray()
        for i in range(num_samples):
            # Generate modulated tone simulating speech formant activity
            t = i / sample_rate
            amp = 0.5 * math.sin(2 * math.pi * frequency * t) * (0.8 + 0.2 * math.sin(2 * math.pi * 3 * t))
            val = int(amp * 32767.0)
            frames.extend(struct.pack("<h", max(-32768, min(32767, val))))

        wf.writeframes(bytes(frames))

    return filepath


if __name__ == "__main__":
    out_dir = Path(__file__).parent
    target = out_dir / "sample_tech_talk.wav"
    generate_test_wav(target, duration_sec=5.0)
    print(f"Generated fixture at: {target} ({target.stat().st_size} bytes)")
