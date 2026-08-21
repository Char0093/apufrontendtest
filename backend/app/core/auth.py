import time

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db
from app.models.employee import Employee, MeetingParticipant


def create_app_token(employee: Employee) -> tuple[str, int]:
    settings = get_settings()
    now = int(time.time())
    expires_at = now + settings.app_jwt_exp_minutes * 60
    payload = {
        "iss": settings.app_jwt_issuer,
        "sub": employee.id,
        "name": employee.name,
        "email": employee.email,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.app_jwt_secret, algorithm="HS256")
    return token, expires_at


def _employee_from_bearer_token(authorization: str | None, db: Session) -> Employee | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.app_jwt_secret,
            algorithms=["HS256"],
            issuer=settings.app_jwt_issuer,
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    employee_id = payload.get("sub")
    if not employee_id:
        raise HTTPException(status_code=401, detail="Access token has no subject")
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if employee is None:
        raise HTTPException(status_code=403, detail="Token subject is not an active employee")
    return employee


def get_current_employee(
    authorization: str | None = Header(None),
    x_user_name: str | None = Header(None),
    db: Session = Depends(get_db),
) -> Employee:
    """Prefer signed app JWTs, with the old X-User-Name path retained for
    demo fallback when OAuth is not configured."""
    bearer_employee = _employee_from_bearer_token(authorization, db)
    if bearer_employee is not None:
        return bearer_employee

    if not x_user_name:
        raise HTTPException(status_code=401, detail="Missing bearer token or X-User-Name header")
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
