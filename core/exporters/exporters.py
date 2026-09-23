"""Export session transcripts into standard SRT, WebVTT, and plaintext formats."""

from __future__ import annotations

from enum import Enum
from typing import Sequence
from core.engine.base import CaptionEvent


class ExportFormat(str, Enum):
    SRT = "srt"
    VTT = "vtt"
    TXT = "txt"


def format_srt_timestamp(ms: int) -> str:
    """Format milliseconds into SubRip timestamp: HH:MM:SS,mmm."""
    if ms < 0:
        ms = 0
    total_seconds, milliseconds = divmod(ms, 1000)
    minutes, seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def format_vtt_timestamp(ms: int) -> str:
    """Format milliseconds into WebVTT timestamp: HH:MM:SS.mmm."""
    if ms < 0:
        ms = 0
    total_seconds, milliseconds = divmod(ms, 1000)
    minutes, seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


class SessionExporter:
    """Exports recorded final caption events of a room into standardized files."""

    @classmethod
    def export(
        cls,
        events: Sequence[CaptionEvent],
        fmt: ExportFormat,
        target_language: str = "es",
        include_speaker: bool = True,
    ) -> str:
        """Filter events to final segments for target language and render format."""
        filtered = [
            e for e in events
            if e.is_final and (e.target_language == target_language or not target_language)
        ]
        # Sort by start_ms
        filtered.sort(key=lambda e: e.start_ms)

        if fmt == ExportFormat.SRT:
            return cls.to_srt(filtered, include_speaker)
        elif fmt == ExportFormat.VTT:
            return cls.to_vtt(filtered, include_speaker)
        elif fmt == ExportFormat.TXT:
            return cls.to_txt(filtered, include_speaker)
        else:
            raise ValueError(f"Unsupported export format: {fmt}")

    @staticmethod
    def to_srt(events: Sequence[CaptionEvent], include_speaker: bool = True) -> str:
        """Render standard SubRip (.srt) subtitle text."""
        blocks: list[str] = []
        for idx, event in enumerate(events, start=1):
            start_tc = format_srt_timestamp(event.start_ms)
            end_tc = format_srt_timestamp(max(event.end_ms, event.start_ms + 1000))

            speaker_tag = f"{event.speaker}: " if (include_speaker and event.speaker) else ""
            line_text = f"{speaker_tag}{event.text.strip()}"

            blocks.append(f"{idx}\n{start_tc} --> {end_tc}\n{line_text}\n")

        return "\n".join(blocks).strip() + "\n"

    @staticmethod
    def to_vtt(events: Sequence[CaptionEvent], include_speaker: bool = True) -> str:
        """Render W3C WebVTT (.vtt) subtitle text."""
        lines: list[str] = ["WEBVTT\n"]
        for idx, event in enumerate(events, start=1):
            start_tc = format_vtt_timestamp(event.start_ms)
            end_tc = format_vtt_timestamp(max(event.end_ms, event.start_ms + 1000))

            speaker_tag = f"<v {event.speaker}>" if (include_speaker and event.speaker) else ""
            line_text = f"{speaker_tag}{event.text.strip()}"

            lines.append(f"{idx}\n{start_tc} --> {end_tc}\n{line_text}\n")

        return "\n".join(lines).strip() + "\n"

    @staticmethod
    def to_txt(events: Sequence[CaptionEvent], include_speaker: bool = True) -> str:
        """Render clean, readable conference transcript with timestamps."""
        lines: list[str] = []
        for event in events:
            time_str = format_vtt_timestamp(event.start_ms)
            speaker_tag = f"[{event.speaker}] " if (include_speaker and event.speaker) else ""
            lines.append(f"({time_str}) {speaker_tag}{event.text.strip()}")

        return "\n".join(lines).strip() + "\n"
