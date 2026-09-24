"""Exhaustive Security, Concurrency, and Resilience Test Suite for LOCE.

Tests defensive hardening against:
1. Path traversal & injection in room_id, export formats, languages, and fixtures.
2. Direct validate_room_id security checks.
3. WebSocket frame size DoS limit enforcement (WS 1009).
4. WebSocket invalid route / policy violation rejection (WS 1008).
5. Broker leak-free unsubscription on forced client disconnects.
6. Secret isolation: ensuring API keys and Redis credentials never leak in responses.
"""

import json
import os
import pytest
from fastapi import HTTPException
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from core.engine.base import SUPPORTED_LANGUAGES
from server.main import app
from server.routers.rooms import validate_room_id


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_validate_room_id_unit():
    """Unit test for validate_room_id against path traversal, special characters and length."""
    valid_ids = ["main-stage", "track_1", "room-123", "STAGE_A"]
    for valid_id in valid_ids:
        assert validate_room_id(valid_id) == valid_id

    malicious_ids = [
        "../traversal",
        "..%2f..%2fetc%2fpasswd",
        "room with spaces",
        "room<script>",
        "room;drop table",
        "room/slash",
        "a" * 65,  # Exceeds 64 characters
        "",
    ]
    for bad_id in malicious_ids:
        with pytest.raises(HTTPException) as exc_info:
            validate_room_id(bad_id)
        assert exc_info.value.status_code == 400


def test_invalid_room_id_rejection_http(client: TestClient):
    """Verify that malformed room_ids are rejected with HTTP 400 or 422."""
    malicious_ids = [
        "bad..traversal",
        "bad;injection",
        "bad<script>",
        "bad space",
        "a" * 65,
    ]

    for bad_id in malicious_ids:
        # GET room
        resp = client.get(f"/api/rooms/{bad_id}")
        assert resp.status_code in (400, 422), f"Expected 400/422 for GET /api/rooms/{bad_id}, got {resp.status_code}"

        # POST start/stop
        resp = client.post(f"/api/rooms/{bad_id}/start")
        assert resp.status_code in (400, 422)

        resp = client.post(f"/api/rooms/{bad_id}/stop")
        assert resp.status_code in (400, 422)

        # GET/POST glossary
        resp = client.get(f"/api/rooms/{bad_id}/glossary")
        assert resp.status_code in (400, 422)

        resp = client.post(f"/api/rooms/{bad_id}/glossary", json={"terms": []})
        assert resp.status_code in (400, 422)


def test_create_room_id_validation(client: TestClient):
    """Verify that room creation enforces the room_id regex."""
    resp = client.post(
        "/api/rooms",
        json={"room_id": "invalid/slash", "name": "Bad Room", "provider_type": "mock"},
    )
    assert resp.status_code in (400, 422)

    resp = client.post(
        "/api/rooms",
        json={"room_id": "valid-stage_01", "name": "Good Room", "provider_type": "mock"},
    )
    assert resp.status_code == 201


def test_export_security_validation(client: TestClient):
    """Verify that export endpoints validate room_id, format, and language."""
    # Create valid room
    client.post(
        "/api/rooms",
        json={"room_id": "sec-export-stage", "name": "Sec Stage", "provider_type": "mock"},
    )

    # Invalid room_id
    resp = client.get("/api/rooms/bad..id/export/srt?lang=es")
    assert resp.status_code in (400, 422)

    # Invalid export format (e.g. attempting command injection or arbitrary file type)
    resp = client.get("/api/rooms/sec-export-stage/export/exe?lang=es")
    assert resp.status_code == 400
    assert "Unsupported format" in resp.json()["detail"]

    resp = client.get("/api/rooms/sec-export-stage/export/json?lang=es")
    assert resp.status_code == 400

    # Invalid language code
    resp = client.get("/api/rooms/sec-export-stage/export/srt?lang=klingon")
    assert resp.status_code == 400
    assert "Unsupported language" in resp.json()["detail"]

    # Valid export
    resp = client.get("/api/rooms/sec-export-stage/export/srt?lang=es")
    assert resp.status_code == 200


def test_fixtures_path_traversal_confinement(client: TestClient):
    """Verify that /fixtures/ strictly prevents directory traversal."""
    # Attempt directory traversal upwards
    resp = client.get("/fixtures/..%2fserver%2fmain.py")
    assert resp.status_code == 400
    assert "Path traversal detected" in resp.json()["detail"]

    resp = client.get("/fixtures/..%2f..%2fetc%2fpasswd")
    assert resp.status_code == 400

    # Valid fixture if it exists returns 200, else 404, but NEVER allows traversal
    resp = client.get("/fixtures/nonexistent_file_test.wav")
    assert resp.status_code == 404


def test_websocket_room_id_and_lang_validation(client: TestClient):
    """Verify that WebSockets reject invalid room_ids or unsupported languages with WS 1008."""
    # Ingest WS invalid room_id
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/ingest/bad..room") as ws:
            ws.receive_text()
    assert exc_info.value.code == 1008

    # Stream WS invalid room_id
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/stream/bad..room?lang=es") as ws:
            ws.receive_text()
    assert exc_info.value.code == 1008

    # Stream WS invalid language
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/stream/valid-room?lang=unsupported_lang") as ws:
            ws.receive_text()
    assert exc_info.value.code == 1008


def test_websocket_ingest_chunk_size_dos_prevention(client: TestClient):
    """Verify that chunks exceeding MAX_AUDIO_CHUNK_BYTES (64 KB) trigger WS 1009."""
    room_id = "dos-test-room"
    client.post(
        "/api/rooms",
        json={"room_id": room_id, "name": "DoS Test Room", "provider_type": "mock"},
    )

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/ws/ingest/{room_id}") as ws:
            # Send an oversized chunk: 66 KB (> 64 KB limit)
            oversized_payload = b"\x00\x01" * 33000
            ws.send_bytes(oversized_payload)
            # Receive text to trigger Starlette's WebSocketDisconnect exception
            ws.receive_text()
    assert exc_info.value.code == 1009


def test_broker_leak_free_unsubscription_on_disconnect(client: TestClient):
    """Verify that disconnecting WebSocket viewers cleanly unsubscribes from the broker."""
    broker = app.state.pubsub_broker
    room_id = "leak-test-room"

    client.post(
        "/api/rooms",
        json={"room_id": room_id, "name": "Leak Test Room", "provider_type": "mock"},
    )

    initial_subscribers_count = len(broker._subscribers.get(room_id, []))

    # Connect viewer
    with client.websocket_connect(f"/ws/stream/{room_id}?lang=es") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "init"
        # Inside connection context, subscriber must be present
        connected_count = len(broker._subscribers.get(room_id, []))
        assert connected_count == initial_subscribers_count + 1

    # After exit (disconnect), subscriber must be purged
    post_count = len(broker._subscribers.get(room_id, []))
    assert post_count == initial_subscribers_count


def test_secret_isolation_in_api_responses(client: TestClient):
    """Verify that sensitive environment variables are never exposed in API payloads."""
    # Ensure room exists
    client.post(
        "/api/rooms",
        json={"room_id": "secret-test-stage", "name": "Secret Test", "provider_type": "mock"},
    )

    # 1. Inspect rooms list
    resp = client.get("/api/rooms")
    assert resp.status_code == 200
    rooms_text = resp.text
    assert "GEMINI_API_KEY" not in rooms_text
    assert "REDIS_URL" not in rooms_text

    # 2. Inspect specific room detail
    resp = client.get("/api/rooms/secret-test-stage")
    assert resp.status_code == 200
    room_text = resp.text
    assert "GEMINI_API_KEY" not in room_text
    assert "REDIS_URL" not in room_text

    # 3. Inspect health check
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert "GEMINI_API_KEY" not in resp.text
    assert "REDIS_URL" not in resp.text
