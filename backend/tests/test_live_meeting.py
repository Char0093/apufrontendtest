import asyncio
import json

from fastapi.testclient import TestClient
from livekit import api as livekit_api

from app.api import live_meeting
from app.core.config import get_settings
from app.main import app

settings = get_settings()
client = TestClient(app, base_url="http://localhost")


def _token_for(room: str, identity: str = "alex-mercer-1") -> str:
    return (
        livekit_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name("Alex Mercer")
        .with_grants(livekit_api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True, can_publish_data=True))
        .to_jwt()
    )


def test_session_ws_rejects_non_auth_first_message():
    with client.websocket_connect("/live-meeting/team-sync/session") as ws:
        ws.send_json({"type": "captions_on"})
        try:
            ws.receive_text()
            assert False, "expected the connection to be closed"
        except Exception:
            pass


def test_session_ws_rejects_invalid_token():
    with client.websocket_connect("/live-meeting/team-sync/session") as ws:
        ws.send_json({"type": "auth", "token": "not-a-real-token"})
        try:
            ws.receive_text()
            assert False, "expected the connection to be closed"
        except Exception:
            pass


def test_session_ws_rejects_token_for_a_different_room():
    token = _token_for(room="other-room")
    with client.websocket_connect("/live-meeting/team-sync/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        try:
            ws.receive_text()
            assert False, "expected the connection to be closed"
        except Exception:
            pass


def test_finalize_is_a_noop_with_no_segments(monkeypatch):
    monkeypatch.setattr(live_meeting, "_FINALIZE_GRACE_SECONDS", 0)
    dispatched = []
    monkeypatch.setattr(live_meeting, "process_live_meeting_task", type("T", (), {"delay": staticmethod(lambda mid: dispatched.append(mid))}))

    token = _token_for(room="empty-room-test", identity="solo-participant")
    with client.websocket_connect("/live-meeting/empty-room-test/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        # No ack is sent on successful auth (see Step 4 below) — the socket
        # goes straight into its receive loop, so there is nothing to read
        # here. Immediately exiting the `with` block below closes the
        # connection, which is exactly the disconnect path this test
        # exercises.

    async def wait_for_finalize():
        for _ in range(20):
            if "empty-room-test" not in live_meeting._sessions:
                return
            await asyncio.sleep(0.05)

    asyncio.run(wait_for_finalize())
    assert "empty-room-test" not in live_meeting._sessions
    assert dispatched == []


def test_looks_decision_like_matches_expected_phrases():
    assert live_meeting._looks_decision_like("Let's go with vendor A") is True
    assert live_meeting._looks_decision_like("We've decided to proceed") is True
    assert live_meeting._looks_decision_like("what time is the next meeting") is False
    assert live_meeting._looks_decision_like("") is False


def test_captions_on_streams_captions_and_triggers_a_suggestion(monkeypatch):
    """The fake connection's queue is pre-populated *before* the server-side
    task ever awaits it, deliberately — TestClient runs the ASGI app in a
    different thread/event loop than this test function, and pushing an
    item into an asyncio.Queue from across threads after something is
    already blocked on .get() is not safe (the waiter's wakeup is bound to
    the other loop). Pre-populating avoids a waiter ever being created:
    Queue.get() returns immediately when the queue is already non-empty."""

    class FakeDeepgramConnection:
        def __init__(self, transcript: str):
            self.results: asyncio.Queue = asyncio.Queue()
            self.results.put_nowait(transcript)
            self.sent = []

        async def send_audio(self, chunk):
            self.sent.append(chunk)

        async def close(self):
            pass

    fake_conn = FakeDeepgramConnection("Let's go with the budget increase")

    async def fake_open_connection():
        return fake_conn

    monkeypatch.setattr(live_meeting.live_transcription_service, "open_connection", fake_open_connection)
    monkeypatch.setattr(settings, "deepgram_api_key", "fake-key-for-test")

    from app.schemas.meeting_intelligence import Flag, FlagType

    monkeypatch.setattr(
        live_meeting.contradiction_service,
        "check_text",
        lambda text, exclude_meeting_id: Flag(type=FlagType.contradiction, message="conflicts with a prior decision", judge="llm"),
    )
    monkeypatch.setattr(live_meeting, "_CONTRADICTION_COOLDOWN_SECONDS", 0)

    token = _token_for(room="captions-room-1", identity="speaker-1")
    with client.websocket_connect("/live-meeting/captions-room-1/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.send_json({"type": "captions_on"})

        caption_message = ws.receive_json()
        assert caption_message["type"] == "caption"
        assert caption_message["text"] == "Let's go with the budget increase"
        assert caption_message["speaker"] == "Alex Mercer"

        suggestion_message = ws.receive_json()
        assert suggestion_message["type"] == "contradiction_suggestion"
        assert suggestion_message["judge"] == "llm"


def test_captions_on_failure_sends_error_without_closing_session(monkeypatch):
    """A Deepgram connection failure must degrade to captions_error, not
    crash the session WS — presence stays up regardless of Deepgram's
    availability."""
    async def failing_open_connection():
        raise ConnectionError("simulated Deepgram outage")

    monkeypatch.setattr(live_meeting.live_transcription_service, "open_connection", failing_open_connection)
    monkeypatch.setattr(settings, "deepgram_api_key", "fake-key-for-test")

    token = _token_for(room="deepgram-down-room", identity="speaker-3")
    with client.websocket_connect("/live-meeting/deepgram-down-room/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.send_json({"type": "captions_on"})
        response = ws.receive_json()
        assert response["type"] == "captions_error"

        # The session WS itself is still alive — a second captions_on retry
        # is processed (and fails the same way) instead of the socket
        # having been torn down.
        ws.send_json({"type": "captions_on"})
        second_response = ws.receive_json()
        assert second_response["type"] == "captions_error"


def test_captions_on_rejected_without_deepgram_key(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "")
    token = _token_for(room="no-deepgram-room", identity="speaker-2")
    with client.websocket_connect("/live-meeting/no-deepgram-room/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.send_json({"type": "captions_on"})
        response = ws.receive_json()
        assert response["type"] == "captions_error"


def test_transcript_so_far_requires_a_valid_token_for_the_room():
    response = client.get("/live-meeting/some-room/transcript-so-far")
    assert response.status_code == 401

    wrong_room_token = _token_for(room="other-room")
    response = client.get("/live-meeting/some-room/transcript-so-far", headers={"Authorization": f"Bearer {wrong_room_token}"})
    assert response.status_code == 403


def test_transcript_so_far_returns_empty_list_for_unknown_room():
    token = _token_for(room="never-used-room")
    response = client.get("/live-meeting/never-used-room/transcript-so-far", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"segments": []}
