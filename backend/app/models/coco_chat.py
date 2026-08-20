import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String

from app.database.session import Base


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CocoChatMessageRecord(Base):
    """One turn of an employee's Ask Coco conversation. citations is stored
    as a JSON-encoded string (SQLite/Postgres both support a plain String
    column here without needing a JSON column type) and decoded back into a
    list on the way out — see app/api/coco_history.py."""
    __tablename__ = "coco_chat_messages"

    id = Column(String, primary_key=True, default=_new_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    role = Column(String, nullable=False)  # 'user' | 'ai'
    text = Column(String, nullable=False)
    citations = Column(String, nullable=True)  # JSON-encoded list[dict]
    created_at = Column(DateTime, default=_utcnow)
