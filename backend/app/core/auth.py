from fastapi import Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.employee import Employee, MeetingParticipant


def get_current_employee(
    x_user_name: str | None = Header(None),
    db: Session = Depends(get_db),
) -> Employee:
    """Demo-grade identity: the frontend asserts a name via the X-User-Name
    header (set from currentUser.name — see api.ts's setApiIdentity), and
    this looks it up against the backend's own employee directory rather
    than trusting it directly. An unrecognized or missing name gets no
    access. Role (is_management) always comes from this lookup, never from
    the header itself, so a forged header can impersonate a specific named
    employee but can't self-grant management rights that employee doesn't
    have."""
    if not x_user_name:
        raise HTTPException(status_code=401, detail="Missing X-User-Name header")
    employee = db.query(Employee).filter(func.lower(Employee.name) == x_user_name.strip().lower()).first()
    if employee is None:
        raise HTTPException(status_code=403, detail=f"Unrecognized user: {x_user_name}")
    return employee


def require_access(target_name: str, caller: Employee) -> None:
    """Shared self-or-management rule for endpoints that let a caller name
    a target other than themselves (e.g. /graph's person param)."""
    if caller.is_management or caller.name.lower() == target_name.strip().lower():
        return
    raise HTTPException(status_code=403, detail=f"Not authorized to view {target_name}'s data")


def require_meeting_access(db: Session, meeting_id: str, caller: Employee) -> None:
    """Per-meeting access check against the meeting_participants table. A
    management caller always passes; a non-management caller needs a
    MeetingParticipant row for this meeting (populated at processing time)."""
    if caller.is_management:
        return
    is_participant = (
        db.query(MeetingParticipant)
        .filter_by(meeting_id=meeting_id, employee_id=caller.id)
        .first()
        is not None
    )
    if not is_participant:
        raise HTTPException(status_code=403, detail=f"Not authorized to view meeting {meeting_id}")
