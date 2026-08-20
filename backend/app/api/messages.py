from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.auth import get_current_employee
from app.database.session import get_db
from app.models.employee import Employee
from app.models.message import DirectMessage
from app.models.notification import NotificationRecord
from app.schemas.message import DirectMessageItem, SendMessageRequest

router = APIRouter()


def _to_item(m: DirectMessage, names: dict[str, str]) -> DirectMessageItem:
    return DirectMessageItem(
        id=m.id,
        sender_name=names.get(m.sender_id, "Unknown"),
        receiver_name=names.get(m.receiver_id, "Unknown"),
        text=m.text,
        is_read=m.is_read,
        # See notifications.py's _to_item for why this needs an explicit Z:
        # SQLite drops the tzinfo marker on the round trip, and an
        # offset-less ISO string gets misread as local time by the
        # frontend's `new Date(iso)`.
        created_at=m.created_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if m.created_at else "",
    )


@router.post("/messages", response_model=DirectMessageItem)
def send_message(
    payload: SendMessageRequest,
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> DirectMessageItem:
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Message text is empty")
    receiver = db.query(Employee).filter(func.lower(Employee.name) == payload.receiver_name.strip().lower()).first()
    if receiver is None:
        raise HTTPException(status_code=400, detail=f"Unknown recipient: {payload.receiver_name}")

    message = DirectMessage(sender_id=caller.id, receiver_id=receiver.id, text=payload.text.strip())
    db.add(message)
    db.add(NotificationRecord(
        employee_id=receiver.id,
        title="New Direct Message",
        message=f"{caller.name}: {payload.text.strip()}",
        category="message",
        type="DIRECT_MESSAGE",
        sender_name=caller.name,
        target_tab="dashboard",
    ))
    db.commit()
    db.refresh(message)

    return _to_item(message, {caller.id: caller.name, receiver.id: receiver.name})


@router.get("/messages", response_model=list[DirectMessageItem])
def list_messages(
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> list[DirectMessageItem]:
    """Every message the caller sent or received, across every
    conversation. There's no thread concept server-side — the frontend
    already filters this flat list into per-contact threads client-side
    (same as it did with the old localStorage-only version), so mirroring
    that here avoids needing a second, thread-scoped endpoint."""
    rows = (
        db.query(DirectMessage)
        .filter(or_(DirectMessage.sender_id == caller.id, DirectMessage.receiver_id == caller.id))
        .order_by(DirectMessage.created_at.asc())
        .all()
    )
    employee_ids = {m.sender_id for m in rows} | {m.receiver_id for m in rows}
    names = {e.id: e.name for e in db.query(Employee).filter(Employee.id.in_(employee_ids))}
    return [_to_item(m, names) for m in rows]


@router.post("/messages/{other_name}/read-all", status_code=204)
def mark_thread_read(
    other_name: str,
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> Response:
    other = db.query(Employee).filter(func.lower(Employee.name) == other_name.strip().lower()).first()
    if other is None:
        raise HTTPException(status_code=404, detail=f"Unknown employee: {other_name}")
    db.query(DirectMessage).filter_by(sender_id=other.id, receiver_id=caller.id, is_read=False).update({"is_read": True})
    db.commit()
    return Response(status_code=204)
