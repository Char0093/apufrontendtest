"""Live meeting session: room presence (auto, on joining the room) and
opt-in caption capture (this file's captions_on/off — added in the next
task) are deliberately decoupled. See "Session lifecycle" in
docs/superpowers/specs/2026-08-15-live-transcript-suggestions-design.md —
that split is what fixes the bug an earlier draft had, where toggling
captions off mid-call (or never toggling them on at all) could finalize the
meeting early or never create one at all.
"""
import asyncio
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.logger import get_logger
from app.database.session import SessionLocal
from app.graph import contradiction_service
from app.models.meeting import Meeting
from app.services import live_transcription_service
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
_CONTRADICTION_COOLDOWN_SECONDS = 15

# Same house style as app.services.askcoco_service._SUMMARY_KEYWORDS —
# phrase matching, not full NLP. A cheap pre-filter so contradiction checks
# (an embedding search + a judge call) only run on text that plausibly
# states a decision, not every sentence spoken in the room.
_DECISION_KEYWORDS = (
    "let's go with", "lets go with", "we'll", "we will", "decided", "decide",
    "agreed", "final", "approved", "approve", "moving forward with",
    "let's do", "lets do",
)


def _looks_decision_like(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in _DECISION_KEYWORDS)


class TranscriptSoFarResponse(BaseModel):
    segments: list[dict]


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


async def _forward_deepgram_results(
    connection: "live_transcription_service.DeepgramLiveConnection",
    websocket: WebSocket,
    session: LiveMeetingSession,
    identity: str,
    display_name: str,
) -> None:
    while True:
        text = await connection.results.get()
        segment = {
            "speaker": display_name,
            "identity": identity,
            "text": text,
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
            "start": (datetime.now(timezone.utc) - session.started_at).total_seconds(),
        }
        async with session.lock:
            session.segments.append(segment)
        await websocket.send_json({"type": "caption", **segment})

        if _looks_decision_like(text):
            now = time.monotonic()
            should_check = False
            async with session.lock:
                if now - session.last_contradiction_check > _CONTRADICTION_COOLDOWN_SECONDS:
                    session.last_contradiction_check = now
                    should_check = True
            if should_check:
                flag = await asyncio.to_thread(contradiction_service.check_text, text, exclude_meeting_id=session.id)
                if flag is not None:
                    # flag.model_dump() first: Flag has its own "type" field
                    # (FlagType — always "contradiction" here), which would
                    # otherwise silently overwrite the envelope's "type" if
                    # the spread came last.
                    await websocket.send_json({**flag.model_dump(), "type": "contradiction_suggestion"})


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

    deepgram = None
    forward_task = None

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            if message.get("text") is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                msg_type = payload.get("type")

                if msg_type == "captions_on":
                    if not settings.deepgram_api_key:
                        await websocket.send_json({"type": "captions_error", "message": "Live captions are not configured on this server."})
                        continue
                    if deepgram is None:
                        try:
                            deepgram = await live_transcription_service.open_connection()
                        except Exception as exc:
                            logger.warning(f"Failed to open Deepgram connection: {exc}")
                            await websocket.send_json({"type": "captions_error", "message": "Could not start live captions right now."})
                            continue
                        forward_task = asyncio.create_task(
                            _forward_deepgram_results(deepgram, websocket, session, identity, display_name)
                        )

                elif msg_type == "captions_off":
                    if deepgram is not None:
                        if forward_task is not None:
                            forward_task.cancel()
                            forward_task = None
                        await deepgram.close()
                        deepgram = None

            elif message.get("bytes") is not None and deepgram is not None:
                try:
                    await deepgram.send_audio(message["bytes"])
                except Exception as exc:
                    # A mid-call Deepgram drop must not crash the session WS
                    # (presence stays up) — degrade to captions_error instead.
                    logger.warning(f"Deepgram send failed, closing captions: {exc}")
                    await websocket.send_json({"type": "captions_error", "message": "Live captions disconnected."})
                    if forward_task is not None:
                        forward_task.cancel()
                        forward_task = None
                    deepgram = None
    except WebSocketDisconnect:
        pass
    finally:
        if forward_task is not None:
            forward_task.cancel()
        if deepgram is not None:
            await deepgram.close()
        async with session.lock:
            session.active_connections -= 1
            if session.active_connections <= 0:
                session.finalize_task = asyncio.create_task(_finalize_after_grace_period(session))


@router.get("/{room_name}/transcript-so-far", response_model=TranscriptSoFarResponse)
def get_transcript_so_far(room_name: str, authorization: str = Header(default="")) -> TranscriptSoFarResponse:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        _verify_token(token, room_name)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    session = _sessions.get(room_name)
    return TranscriptSoFarResponse(segments=list(session.segments) if session else [])
