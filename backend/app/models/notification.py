import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String

from app.database.session import Base


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NotificationRecord(Base):
    """A recipient-scoped notification — currently written only when a
    meeting invite is created (see api/meetings.py's create_meeting), so an
    invitee sees it from any device they log into, not just the one the
    meeting was scheduled from."""
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=_new_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    category = Column(String, nullable=False, default="meeting")
    type = Column(String, nullable=True)
    meeting_id = Column(String, nullable=True)
    sender_name = Column(String, nullable=True)
    target_tab = Column(String, nullable=True)
    read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=_utcnow)
