from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.auth import get_current_employee
from app.database.session import get_db
from app.models.employee import Employee
from app.models.notification import NotificationRecord
from app.schemas.notification import NotificationItem

router = APIRouter()


def _to_item(n: NotificationRecord) -> NotificationItem:
    return NotificationItem(
        id=n.id,
        title=n.title,
        message=n.message,
        category=n.category,
        type=n.type,
        meeting_id=n.meeting_id,
        sender_name=n.sender_name,
        target_tab=n.target_tab,
        read=n.read,
        # created_at is always written via _utcnow() (see models/notification.py),
        # but SQLite's DateTime column drops the tzinfo marker on the round
        # trip — isoformat() on that naive value would then omit the UTC
        # offset entirely, and the frontend's `new Date(iso)` parses an
        # offset-less string as *local* time, silently shifting every
        # timestamp by the browser's UTC offset (e.g. "just now" rendering
        # as "8h ago"). Formatting with an explicit Z sidesteps that.
        created_at=n.created_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if n.created_at else "",
    )


@router.get("/notifications", response_model=list[NotificationItem])
def list_notifications(
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> list[NotificationItem]:
    rows = (
        db.query(NotificationRecord)
        .filter_by(employee_id=caller.id)
        .order_by(NotificationRecord.created_at.desc())
        .all()
    )
    return [_to_item(n) for n in rows]


@router.patch("/notifications/{notification_id}/read", status_code=204)
def mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> Response:
    row = db.query(NotificationRecord).filter_by(id=notification_id, employee_id=caller.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.read = True
    db.commit()
    return Response(status_code=204)


@router.post("/notifications/read-all", status_code=204)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> Response:
    db.query(NotificationRecord).filter_by(employee_id=caller.id, read=False).update({"read": True})
    db.commit()
    return Response(status_code=204)
