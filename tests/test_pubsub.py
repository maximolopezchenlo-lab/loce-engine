"""Tests for in-memory PubSub broker, multi-subscriber fan-out, and backpressure."""

import asyncio
import pytest
from core.engine.base import CaptionEvent
from server.pubsub.broker import PubSubBroker


@pytest.mark.asyncio
async def test_pubsub_broadcast_and_language_filtering():
    broker = PubSubBroker()

    # Subscriber A wants Spanish
    sub_es = await broker.subscribe("sub-1", room_id="room-1", target_language="es")
    # Subscriber B wants English
    sub_en = await broker.subscribe("sub-2", room_id="room-1", target_language="en")
    # Subscriber C wants all languages
    sub_all = await broker.subscribe("sub-3", room_id="room-1", target_language=None)

    assert broker.get_subscriber_count("room-1") == 3

    # Emit Spanish event
    es_event = CaptionEvent(
        id="e1",
        room_id="room-1",
        target_language="es",
        text="Hola",
        is_final=True,
    )
    await broker.publish(es_event)

    # Sub A receives, Sub B does not, Sub C receives
    msg_a = await asyncio.wait_for(sub_es.queue.get(), timeout=0.5)
    assert msg_a.text == "Hola"
    assert sub_en.queue.empty()

    msg_c = await asyncio.wait_for(sub_all.queue.get(), timeout=0.5)
    assert msg_c.text == "Hola"

    # Emit English event
    en_event = CaptionEvent(
        id="e2",
        room_id="room-1",
        target_language="en",
        text="Hello",
        is_final=True,
    )
    await broker.publish(en_event)

    msg_b = await asyncio.wait_for(sub_en.queue.get(), timeout=0.5)
    assert msg_b.text == "Hello"
    assert sub_es.queue.empty()

    # Clean up
    await broker.unsubscribe(sub_es)
    await broker.unsubscribe(sub_en)
    await broker.unsubscribe(sub_all)
    assert broker.get_subscriber_count("room-1") == 0


@pytest.mark.asyncio
async def test_pubsub_backpressure_drop():
    broker = PubSubBroker()
    # Subscriber with small queue
    sub = await broker.subscribe("slow-client", room_id="room-slow", target_language="es")
    # Artificially fill queue
    for i in range(150):
        await sub.put(
            CaptionEvent(id=f"{i}", room_id="room-slow", target_language="es", text=f"event {i}")
        )

    # 151st event should drop oldest without crashing
    overflow_event = CaptionEvent(
        id="overflow",
        room_id="room-slow",
        target_language="es",
        text="overflow event",
    )
    await sub.put(overflow_event)

    assert sub.dropped_events == 1
    await broker.unsubscribe(sub)


@pytest.mark.asyncio
async def test_pubsub_backpressure_preserves_finals():
    """Verify that when queue is saturated, partials are evicted but finals are never dropped."""
    broker = PubSubBroker()
    sub = await broker.subscribe("client-protect-finals", room_id="room-finals", target_language="es")

    # Put a final event first
    final_event_1 = CaptionEvent(
        id="final-1",
        room_id="room-finals",
        target_language="es",
        text="Essential final caption 1",
        is_final=True,
    )
    await sub.put(final_event_1)

    # Fill up to max (150 is maxsize) with 149 partials
    for i in range(149):
        await sub.put(
            CaptionEvent(
                id=f"partial-{i}",
                room_id="room-finals",
                target_language="es",
                text=f"partial draft {i}",
                is_final=False,
            )
        )

    assert sub.queue.full()


    # Now put another final event into a full queue
    final_event_2 = CaptionEvent(
        id="final-2",
        room_id="room-finals",
        target_language="es",
        text="Essential final caption 2",
        is_final=True,
    )
    await sub.put(final_event_2)

    # A partial should have been dropped, but both finals must still be in the queue
    queued_events: list[CaptionEvent] = []
    while not sub.queue.empty():
        queued_events.append(sub.queue.get_nowait())

    final_ids = [e.id for e in queued_events if e.is_final]
    assert "final-1" in final_ids
    assert "final-2" in final_ids
    assert sub.dropped_events >= 1

    await broker.unsubscribe(sub)


@pytest.mark.asyncio
async def test_pubsub_portuguese_filtering():
    """Verify Portuguese captions are properly routed to Portuguese subscribers."""
    broker = PubSubBroker()
    sub_pt = await broker.subscribe("sub-pt", room_id="room-multi", target_language="pt")
    sub_es = await broker.subscribe("sub-es", room_id="room-multi", target_language="es")

    pt_event = CaptionEvent(
        id="pt-1",
        room_id="room-multi",
        target_language="pt",
        text="Bem-vindos à conferência de tecnologia.",
        is_final=True,
    )
    await broker.publish(pt_event)

    msg_pt = await asyncio.wait_for(sub_pt.queue.get(), timeout=0.5)
    assert msg_pt.text == "Bem-vindos à conferência de tecnologia."
    assert sub_es.queue.empty()

    await broker.unsubscribe(sub_pt)
    await broker.unsubscribe(sub_es)

