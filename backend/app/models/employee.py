import uuid

from sqlalchemy import Boolean, Column, ForeignKey, String, UniqueConstraint

from app.database.session import Base


def _new_id() -> str:
    return str(uuid.uuid4())


class Employee(Base):
    """Backend-owned identity + role record. `name` is the matching key used
    everywhere else in this codebase (Neo4j Person.name, AI-extracted
    meeting participants) — kept consistent rather than introducing a
    second, email-keyed identity space."""
    __tablename__ = "employees"

    id = Column(String, primary_key=True, default=_new_id)
    name = Column(String, nullable=False, unique=True)
    email = Column(String, nullable=False, unique=True)
    title = Column(String, nullable=True)
    is_management = Column(Boolean, nullable=False, default=False)


class MeetingParticipant(Base):
    """Stable access-control source for 'can this employee see this
    meeting' — a management caller bypasses this check entirely (see
    app/core/auth.py), so this table only matters once a non-management
    employee persona exists."""
    __tablename__ = "meeting_participants"

    id = Column(String, primary_key=True, default=_new_id)
    meeting_id = Column(String, ForeignKey("meetings.id"), nullable=False)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)

    __table_args__ = (UniqueConstraint("meeting_id", "employee_id", name="uq_meeting_employee"),)
