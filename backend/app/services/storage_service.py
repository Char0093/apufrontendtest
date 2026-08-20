import json
import re
from pathlib import Path

from app.core.config import get_settings
from app.database.session import SessionLocal
from app.models.meeting_content import MeetingContent

_SUBDIRS = ("raw", "audio", "exports", "whiteboards")


def _safe_room_code(room_code: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "-", room_code)


class StorageService:
    """Binary/large files (raw uploads, extracted audio, export files,
    whiteboard PDFs) live on local disk under base_path — genuinely
    ephemeral on Hugging Face Spaces (wiped on every container rebuild),
    which is an accepted gap for now; fixing it needs a real object-storage
    service. JSON meeting content (summary/transcript/live segments) used
    to live on that same ephemeral disk too, which meant a meeting's actual
    decisions/transcript text vanished on the next backend redeploy even
    though its metadata (Postgres) and graph structure (Neo4j) survived —
    that content now lives in the meeting_content Postgres table instead,
    via the same DATABASE_URL everything else already persists through."""

    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or get_settings().storage_path)
        for sub in _SUBDIRS:
            (self.base_path / sub).mkdir(parents=True, exist_ok=True)

    # ── Binary/large files — local disk, ephemeral ──────────────────────

    def save_raw_file(self, meeting_id: str, filename: str, content: bytes) -> str:
        ext = Path(filename).suffix
        relative_path = f"raw/{meeting_id}{ext}"
        (self.base_path / relative_path).write_bytes(content)
        return relative_path

    def save_audio(self, meeting_id: str, content: bytes) -> str:
        relative_path = f"audio/{meeting_id}.wav"
        (self.base_path / relative_path).write_bytes(content)
        return relative_path

    def save_export(self, meeting_id: str, content: str, fmt: str = "md") -> str:
        relative_path = f"exports/{meeting_id}.{fmt}"
        (self.base_path / relative_path).write_text(content)
        return relative_path

    def get_file(self, relative_path: str) -> bytes:
        return (self.base_path / relative_path).read_bytes()

    def save_whiteboard(self, room_code: str, content: bytes) -> str:
        """Keyed by the LiveKit room code, not a meeting id — the auto-save
        happens the moment someone leaves the room, well before the real
        Meeting row for that session exists (see live_meeting.py's 45s
        finalization grace period), and the room code is the one stable
        identifier both the client's just-left summary and the eventual
        backend Meeting row (room_id) already share."""
        relative_path = f"whiteboards/{_safe_room_code(room_code)}.pdf"
        (self.base_path / relative_path).write_bytes(content)
        return relative_path

    def get_whiteboard(self, room_code: str) -> bytes | None:
        p = self.base_path / "whiteboards" / f"{_safe_room_code(room_code)}.pdf"
        return p.read_bytes() if p.exists() else None

    # ── JSON meeting content — Postgres-backed ──────────────────────────

    def _content_get(self, meeting_id: str, content_type: str):
        db = SessionLocal()
        try:
            row = db.query(MeetingContent).filter_by(meeting_id=meeting_id, content_type=content_type).first()
            if row is None:
                return None
            try:
                return json.loads(row.data)
            except (TypeError, ValueError):
                return None
        finally:
            db.close()

    def _content_save(self, meeting_id: str, content_type: str, data) -> None:
        db = SessionLocal()
        try:
            row = db.query(MeetingContent).filter_by(meeting_id=meeting_id, content_type=content_type).first()
            encoded = json.dumps(data)
            if row is None:
                db.add(MeetingContent(meeting_id=meeting_id, content_type=content_type, data=encoded))
            else:
                row.data = encoded
            db.commit()
        finally:
            db.close()

    def save_transcript(self, meeting_id: str, data: dict) -> None:
        self._content_save(meeting_id, "transcript", data)

    def get_transcript(self, meeting_id: str) -> dict | None:
        return self._content_get(meeting_id, "transcript")

    def save_summary(self, meeting_id: str, data: dict) -> None:
        self._content_save(meeting_id, "summary", data)

    def get_summary(self, meeting_id: str) -> dict | None:
        return self._content_get(meeting_id, "summary")

    def list_summaries(self) -> list[tuple[str, dict]]:
        """Every meeting with a saved summary, as (meeting_id, data) pairs —
        for the org-wide fallbacks (Ask Coco's "gather all stored meeting
        knowledge", the dashboard's Neo4j-offline aggregate, /graph's
        Neo4j-offline fallback) that used to glob the summaries/ directory
        for filenames instead of querying this table."""
        db = SessionLocal()
        try:
            rows = db.query(MeetingContent).filter_by(content_type="summary").all()
            out: list[tuple[str, dict]] = []
            for row in rows:
                try:
                    out.append((row.meeting_id, json.loads(row.data)))
                except (TypeError, ValueError):
                    continue
            return out
        finally:
            db.close()

    def save_live_segments(self, meeting_id: str, segments: list[dict]) -> None:
        """Raw segments captured live, before Gemini extraction — read back
        by process_live_meeting_task."""
        self._content_save(meeting_id, "live_segments", segments)

    def get_live_segments(self, meeting_id: str) -> list[dict]:
        data = self._content_get(meeting_id, "live_segments")
        if data is None:
            raise FileNotFoundError(f"No live segments saved for meeting {meeting_id}")
        return data

    def delete_meeting_files(self, meeting_id: str) -> None:
        """Deletes all storage (local files + Postgres meeting_content rows)
        for a meeting."""
        for sub in _SUBDIRS:
            sub_dir = self.base_path / sub
            if not sub_dir.exists():
                continue
            for file_path in sub_dir.glob(f"{meeting_id}*"):
                try:
                    file_path.unlink()
                except Exception:
                    pass

        db = SessionLocal()
        try:
            db.query(MeetingContent).filter_by(meeting_id=meeting_id).delete()
            db.commit()
        finally:
            db.close()


storage = StorageService()
