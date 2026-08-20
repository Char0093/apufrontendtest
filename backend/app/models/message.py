import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String

from app.database.session import Base


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DirectMessage(Base):
    """A single direct message between two employees. There's no separate
    conversation/thread record — a "thread" is just every DirectMessage row
    where the two employee ids match, in either sender/receiver order (see
    GET /messages, which returns everything for the caller and lets the
    frontend filter client-side, matching how it already worked locally)."""
    __tablename__ = "direct_messages"

    id = Column(String, primary_key=True, default=_new_id)
    sender_id = Column(String, ForeignKey("employees.id"), nullable=False)
    receiver_id = Column(String, ForeignKey("employees.id"), nullable=False)
    text = Column(String, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=_utcnow)
