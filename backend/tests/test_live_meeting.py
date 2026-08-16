import asyncio
import json

from fastapi.testclient import TestClient
from livekit import api as livekit_api

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
    from app.api import live_meeting

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
