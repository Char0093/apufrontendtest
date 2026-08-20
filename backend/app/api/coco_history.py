import json

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.auth import get_current_employee
from app.database.session import get_db
from app.models.coco_chat import CocoChatMessageRecord
from app.models.employee import Employee
from app.schemas.coco_chat import CocoMessageCreate, CocoMessageItem

router = APIRouter()


def _to_item(m: CocoChatMessageRecord) -> CocoMessageItem:
    try:
        citations = json.loads(m.citations) if m.citations else []
    except (TypeError, ValueError):
        citations = []
    return CocoMessageItem(
        id=m.id,
        role=m.role,
        text=m.text,
        citations=citations,
        created_at=m.created_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if m.created_at else "",
    )


@router.get("/coco/history", response_model=list[CocoMessageItem])
def get_coco_history(
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> list[CocoMessageItem]:
    rows = (
        db.query(CocoChatMessageRecord)
        .filter_by(employee_id=caller.id)
        .order_by(CocoChatMessageRecord.created_at.asc())
        .all()
    )
    return [_to_item(m) for m in rows]


@router.post("/coco/history", response_model=CocoMessageItem)
def append_coco_message(
    payload: CocoMessageCreate,
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> CocoMessageItem:
    message = CocoChatMessageRecord(
        employee_id=caller.id,
        role=payload.role,
        text=payload.text,
        citations=json.dumps(payload.citations) if payload.citations else None,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return _to_item(message)


@router.delete("/coco/history", status_code=204)
def clear_coco_history(
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> Response:
    db.query(CocoChatMessageRecord).filter_by(employee_id=caller.id).delete()
    db.commit()
    return Response(status_code=204)
