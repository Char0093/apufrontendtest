from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.logger import get_logger
from app.database.session import get_db
from app.models.meeting import Meeting, ProcessingTask
from app.schemas.meeting import (
    MeetingCreate,
    MeetingCreateResponse,
    MeetingStatusResponse,
)
from app.services.storage_service import StorageService
from app.tasks.meeting_tasks import process_meeting_task

router = APIRouter()
logger = get_logger(__name__)
storage = StorageService()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4"}


@router.post("/meetings", response_model=MeetingCreateResponse)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db)) -> MeetingCreateResponse:
    meeting = Meeting(title=payload.title, project=payload.project, date=payload.date)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    logger.info(f"Meeting {meeting.id} created")
    return MeetingCreateResponse(meeting_id=meeting.id)


@router.post("/upload", response_model=MeetingCreateResponse, status_code=202)
async def upload_meeting(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    project: str | None = Form(None),
    db: Session = Depends(get_db),
) -> MeetingCreateResponse:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {ext or '(none)'}")

    meeting_title = title or Path(file.filename).stem
    meeting = Meeting(title=meeting_title, project=project, status="queued")
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    content = await file.read()
    relative_path = storage.save_raw_file(meeting.id, file.filename, content)
    meeting.file_path = relative_path
    db.commit()

    process_meeting_task.delay(meeting.id)
    logger.info(f"Meeting {meeting.id} uploaded ({len(content)} bytes), queued for processing")

    return MeetingCreateResponse(meeting_id=meeting.id)


@router.get("/task/{meeting_id}/status", response_model=MeetingStatusResponse)
def get_task_status(meeting_id: str, db: Session = Depends(get_db)) -> MeetingStatusResponse:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if meeting is None:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")

    latest_task = (
        db.query(ProcessingTask)
        .filter(ProcessingTask.meeting_id == meeting_id)
        .order_by(ProcessingTask.created_at.desc())
        .first()
    )

    return MeetingStatusResponse(
        meeting_id=meeting.id,
        status=meeting.status,
        progress_percentage=meeting.progress,
        error_message=latest_task.error_message if latest_task else None,
    )
