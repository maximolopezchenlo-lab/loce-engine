"""Integration tests for LOCE FastAPI REST and WebSocket endpoints."""

import json
import pytest
from starlette.testclient import TestClient

from server.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_healthz(client: TestClient):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_rooms_crud_and_glossary(client: TestClient):
    # 1. Create room
    create_payload = {
        "room_id": "test-stage-1",
        "name": "Integration Test Stage",
        "source_language": "en",
        "target_languages": ["es", "en"],
        "provider_type": "mock",
    }
    resp = client.post("/api/rooms", json=create_payload)
    assert resp.status_code == 201
    assert resp.json()["room_id"] == "test-stage-1"

    # 2. List rooms
    resp = client.get("/api/rooms")
    assert resp.status_code == 200
    rooms = resp.json()["rooms"]
    room_ids = [r["room_id"] for r in rooms]
    assert "test-stage-1" in room_ids

    # 3. Get room details
    resp = client.get("/api/rooms/test-stage-1")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Integration Test Stage"

    # 4. Update glossary
    glossary_payload = {
        "terms": ["Rust", "Wasm"],
        "speakers": ["Speaker One"],
        "replacements": {r"\brusty\b": "Rust"},
    }
    resp = client.post("/api/rooms/test-stage-1/glossary", json=glossary_payload)
    assert resp.status_code == 200
    assert resp.json()["terms_count"] == 2

    # 5. Fetch glossary
    resp = client.get("/api/rooms/test-stage-1/glossary")
    assert resp.status_code == 200
    assert "Rust" in resp.json()["terms"]


def test_export_endpoints(client: TestClient):
    # Ensure room exists
    client.post(
        "/api/rooms",
        json={"room_id": "export-room", "name": "Export Test", "provider_type": "mock"},
    )

    # Test SRT export
    resp = client.get("/api/rooms/export-room/export/srt?lang=es")
    assert resp.status_code == 200
    assert "attachment; filename=" in resp.headers["content-disposition"]

    # Test VTT export
    resp = client.get("/api/rooms/export-room/export/vtt?lang=es")
    assert resp.status_code == 200
    assert "WEBVTT" in resp.text

    # Test TXT export
    resp = client.get("/api/rooms/export-room/export/txt?lang=es")
    assert resp.status_code == 200


def test_websocket_stream_initial_message(client: TestClient):
    # Connect to stream websocket
    with client.websocket_connect("/ws/stream/main-stage?lang=es") as websocket:
        msg = websocket.receive_json()
        assert msg["type"] == "init"
        assert msg["room_id"] == "main-stage"
        assert msg["target_language"] == "es"
        assert "history" in msg


def test_websocket_audio_ingest_and_stream(client: TestClient):
    room_id = "ws-e2e-room"
    client.post(
        "/api/rooms",
        json={"room_id": room_id, "name": "E2E Room", "provider_type": "mock"},
    )

    # Open listener websocket
    with client.websocket_connect(f"/ws/stream/{room_id}?lang=es") as stream_ws:
        init_msg = stream_ws.receive_json()
        assert init_msg["type"] == "init"

        # Open ingest websocket and stream audio chunks
        with client.websocket_connect(f"/ws/ingest/{room_id}") as ingest_ws:
            # 6400 bytes = 200ms chunk at 16kHz 16-bit mono
            pcm_chunk = b"\x00\x01" * 3200
            for _ in range(16):
                ingest_ws.send_bytes(pcm_chunk)

        # Stream client should receive caption events
        received_caption = False
        for _ in range(10):
            raw = stream_ws.receive_text()
            data = json.loads(raw)
            if data.get("type") == "caption":
                received_caption = True
                assert data["data"]["room_id"] == room_id
                assert data["data"]["target_language"] == "es"
                break

        assert received_caption is True
