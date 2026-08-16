"""Live meeting session: room presence (auto, on joining the room) and
opt-in caption capture (this file's captions_on/off — added in the next
task) are deliberately decoupled. See "Session lifecycle" in
docs/superpowers/specs/2026-08-15-live-transcript-suggestions-design.md —
that split is what fixes the bug an earlier draft had, where toggling
captions off mid-call (or never toggling them on at all) could finalize the
meeting early or never create one at all.
"""
import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.logger import get_logger
from app.database.session import SessionLocal
from app.models.meeting import Meeting
from app.services.storage_service import StorageService
from app.tasks.meeting_tasks import process_live_meeting_task

try:
    from livekit import api as livekit_api
except ImportError:  # Keeps the rest of the API available until installed.
    livekit_api = None

logger = get_logger(__name__)
settings = get_settings()
storage = StorageService()

router = APIRouter(prefix="/live-meeting", tags=["live-meeting"])

_SAFE_ROOM = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")
_FINALIZE_GRACE_SECONDS = 45


@dataclass
class LiveMeetingSession:
    room_name: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    segments: list[dict] = field(default_factory=list)
    active_connections: int = 0
    last_contradiction_check: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    finalize_task: "asyncio.Task | None" = None


_sessions: dict[str, LiveMeetingSession] = {}
_sessions_lock = asyncio.Lock()


async def _get_or_create_session(room_name: str) -> LiveMeetingSession:
    async with _sessions_lock:
        session = _sessions.get(room_name)
        if session is None:
            session = LiveMeetingSession(room_name=room_name)
            _sessions[room_name] = session
        return session


def _verify_token(token: str, room_name: str) -> tuple[str, str]:
    """Returns (identity, display_name). Raises ValueError on any failure —
    missing verifier, bad/expired signature, or a token valid for some
    *other* room."""
    if livekit_api is None:
        raise ValueError("LiveKit support is not installed on the API server")
    try:
        verifier = livekit_api.TokenVerifier(settings.livekit_api_key, settings.livekit_api_secret)
        claims = verifier.verify(token)
    except Exception as exc:
        raise ValueError(f"Invalid or expired token: {exc}") from exc
    if not claims.video or claims.video.room != room_name:
        raise ValueError("Token is not valid for this room")
    return claims.identity, claims.name or claims.identity


def _create_meeting_from_session(room_name: str, started_at: datetime, segments: list[dict]) -> str:
    """Finalization metadata: no new Meeting columns needed — reuses the
    existing nullable date/duration fields, and generates a distinguishing
    title so repeated calls in the same default 'team-sync' room don't all
    look identical in Meeting Intelligence."""
    ended_at = datetime.now(timezone.utc)
    elapsed = max(0, int((ended_at - started_at).total_seconds()))
    h, m, s = elapsed // 3600, (elapsed % 3600) // 60, elapsed % 60
    duration = f"{h:02d}:{m:02d}:{s:02d}"
    title = f"Live: {room_name} — {started_at.strftime('%Y-%m-%d %H:%M')}"

    db = SessionLocal()
    try:
        meeting = Meeting(
            title=title,
            date=started_at.strftime("%Y-%m-%d %H:%M"),
            duration=duration,
            file_path=None,
            status="pending",
        )
        db.add(meeting)
        db.commit()
        db.refresh(meeting)
        meeting_id = meeting.id
    finally:
        db.close()

    storage.save_live_segments(meeting_id, segments)
    return meeting_id


async def _finalize_after_grace_period(session: LiveMeetingSession) -> None:
    try:
        await asyncio.sleep(_FINALIZE_GRACE_SECONDS)
    except asyncio.CancelledError:
        return

    async with session.lock:
        if session.active_connections > 0:
            return
        segments = list(session.segments)
        started_at = session.started_at

    async with _sessions_lock:
        _sessions.pop(session.room_name, None)

    if not segments:
        return

    meeting_id = _create_meeting_from_session(session.room_name, started_at, segments)
    process_live_meeting_task.delay(meeting_id)
    logger.info(f"Live meeting in room '{session.room_name}' finalized as {meeting_id} ({len(segments)} segments)")


@router.websocket("/{room_name}/session")
async def live_meeting_session(websocket: WebSocket, room_name: str) -> None:
    if not _SAFE_ROOM.fullmatch(room_name):
        await websocket.close(code=4004, reason="Invalid room name")
        return

    await websocket.accept()

    try:
        first_message = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4001, reason="Expected an auth message")
        return

    if first_message.get("type") != "auth" or not isinstance(first_message.get("token"), str):
        await websocket.close(code=4001, reason="First message must be {type: auth, token: ...}")
        return

    try:
        identity, display_name = _verify_token(first_message["token"], room_name)
    except ValueError as exc:
        await websocket.close(code=4001, reason=str(exc)[:120])
        return

    session = await _get_or_create_session(room_name)
    async with session.lock:
        session.active_connections += 1
        if session.finalize_task is not None:
            session.finalize_task.cancel()
            session.finalize_task = None

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            # captions_on/off + audio handling lands in the next task —
            # for now, anything text-typed with an unrecognized type, and
            # any binary frame, is simply ignored (no captions capability
            # exists yet on this branch of work).
    except WebSocketDisconnect:
        pass
    finally:
        async with session.lock:
            session.active_connections -= 1
            if session.active_connections <= 0:
                session.finalize_task = asyncio.create_task(_finalize_after_grace_period(session))
