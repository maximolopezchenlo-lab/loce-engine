"""Tests for SRT, VTT, and TXT subtitle exporters."""

from core.engine.base import CaptionEvent
from core.exporters.exporters import (
    ExportFormat,
    SessionExporter,
    format_srt_timestamp,
    format_vtt_timestamp,
)


def test_timestamp_formatting():
    # 0 ms -> 00:00:00,000 / 00:00:00.000
    assert format_srt_timestamp(0) == "00:00:00,000"
    assert format_vtt_timestamp(0) == "00:00:00.000"

    # 1 hr 23 min 45 sec 678 ms = 5025678 ms
    ms = (1 * 3600 + 23 * 60 + 45) * 1000 + 678
    assert format_srt_timestamp(ms) == "01:23:45,678"
    assert format_vtt_timestamp(ms) == "01:23:45.678"


def test_srt_export():
    events = [
        CaptionEvent(
            id="1",
            room_id="room-1",
            target_language="es",
            text="Bienvenidos a la conferencia.",
            is_final=True,
            start_ms=1000,
            end_ms=3500,
            speaker="Alice",
        ),
        CaptionEvent(
            id="2",
            room_id="room-1",
            target_language="es",
            text="Hablaremos de streaming.",
            is_final=True,
            start_ms=4000,
            end_ms=6200,
            speaker="Alice",
        ),
        # Partial event - must be omitted from final export
        CaptionEvent(
            id="3",
            room_id="room-1",
            target_language="es",
            text="este es parcial",
            is_final=False,
            start_ms=6500,
            end_ms=7000,
        ),
    ]

    srt_out = SessionExporter.export(events, fmt=ExportFormat.SRT, target_language="es")
    assert "1\n00:00:01,000 --> 00:00:03,500\nAlice: Bienvenidos a la conferencia." in srt_out
    assert "2\n00:00:04,000 --> 00:00:06,200\nAlice: Hablaremos de streaming." in srt_out
    assert "parcial" not in srt_out


def test_vtt_export():
    events = [
        CaptionEvent(
            id="1",
            room_id="room-1",
            target_language="es",
            text="Hola mundo.",
            is_final=True,
            start_ms=500,
            end_ms=2500,
            speaker="Bob",
        )
    ]

    vtt_out = SessionExporter.export(events, fmt=ExportFormat.VTT, target_language="es")
    assert vtt_out.startswith("WEBVTT")
    assert "00:00:00.500 --> 00:00:02.500" in vtt_out
    assert "<v Bob>Hola mundo." in vtt_out


def test_txt_export():
    events = [
        CaptionEvent(
            id="1",
            room_id="room-1",
            target_language="es",
            text="Hola mundo.",
            is_final=True,
            start_ms=1000,
            end_ms=2000,
            speaker="Bob",
        )
    ]

    txt_out = SessionExporter.export(events, fmt=ExportFormat.TXT, target_language="es")
    assert "(00:00:01.000) [Bob] Hola mundo." in txt_out


def test_multilingual_utf8_export():
    """Verify Russian (Cyrillic) and Chinese (CJK) characters export without corruption."""
    ru_event = CaptionEvent(
        id="ru-1",
        room_id="room-ru",
        target_language="ru",
        text="Добро пожаловать на пленарное заседание по распределенным системам.",
        is_final=True,
        start_ms=1000,
        end_ms=4500,
        speaker="Д-р Сара Чен",
    )
    zh_event = CaptionEvent(
        id="zh-1",
        room_id="room-zh",
        target_language="zh",
        text="欢迎大家参加关于分布式系统的主题演讲。",
        is_final=True,
        start_ms=1000,
        end_ms=4500,
        speaker="陈博士",
    )

    ru_srt = SessionExporter.export([ru_event], fmt=ExportFormat.SRT, target_language="ru")
    assert "Д-р Сара Чен: Добро пожаловать на пленарное заседание по распределенным системам." in ru_srt
    # Test byte encoding/decoding as UTF-8
    assert ru_srt.encode("utf-8").decode("utf-8") == ru_srt

    zh_vtt = SessionExporter.export([zh_event], fmt=ExportFormat.VTT, target_language="zh")
    assert "<v 陈博士>欢迎大家参加关于分布式系统的主题演讲。" in zh_vtt
    assert zh_vtt.encode("utf-8").decode("utf-8") == zh_vtt

