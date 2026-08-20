import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint

from app.database.session import Base


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MeetingContent(Base):
    """JSON meeting content (summary, transcript, raw live-session
    segments) that used to live only as local-disk files under
    StorageService's base_path — which on Hugging Face Spaces is wiped on
    every container rebuild, unlike this table's Postgres backing.
    Deliberately excludes actual binary files (raw audio/video, whiteboard
    PDFs) — those stay on local disk; a bytea/Postgres blob isn't the right
    fit for that at any real scale, and would need a real object-storage
    service (S3/R2/etc.) to fix properly."""
    __tablename__ = "meeting_content"

    id = Column(String, primary_key=True, default=_new_id)
    meeting_id = Column(String, ForeignKey("meetings.id"), nullable=False)
    content_type = Column(String, nullable=False)  # 'summary' | 'transcript' | 'live_segments'
    data = Column(Text, nullable=False)  # JSON-encoded
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (UniqueConstraint("meeting_id", "content_type", name="uq_meeting_content_type"),)
