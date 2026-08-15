import json
from pathlib import Path

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.logger import get_logger
from app.database.session import get_db
from app.models.meeting import Meeting, ProcessingTask
from app.schemas.meeting import (
    MeetingCreate,
    MeetingCreateResponse,
    MeetingListItem,
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


# ── Task 5.1 — Meeting list ────────────────────────────────────────────
@router.get("/meetings", response_model=list[MeetingListItem])
def list_meetings(
    keyword: str | None = None,
    project: str | None = None,
    participant: str | None = None,
    date: str | None = None,
    db: Session = Depends(get_db),
) -> list[MeetingListItem]:
    query = db.query(Meeting)
    if keyword:
        query = query.filter(Meeting.title.ilike(f"%{keyword}%"))
    if project:
        query = query.filter(Meeting.project == project)
    if date:
        query = query.filter(Meeting.date == date)

    items: list[MeetingListItem] = []
    for meeting in query.order_by(Meeting.created_at.desc()).all():
        summary = _load_json(f"summaries/{meeting.id}.json")
        participants = summary.get("participants", []) if summary else []

        if participant and participant not in participants:
            continue

        items.append(MeetingListItem(
            id=meeting.id,
            title=meeting.title,
            project=meeting.project,
            date=meeting.date,
            status=meeting.status,
            progress=meeting.progress,
            decisions_count=len(summary.get("decisions", [])) if summary else 0,
            action_items_count=len(summary.get("action_items", [])) if summary else 0,
            flags_count=len(summary.get("flags", [])) if summary else 0,
        ))
    return items


# ── Task 5.2 — Transcript ──────────────────────────────────────────────
@router.get("/meeting/{meeting_id}/transcript")
def get_meeting_transcript(meeting_id: str, db: Session = Depends(get_db)) -> dict:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if meeting is None:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")

    transcript = _load_json(f"transcripts/{meeting_id}.json")
    if transcript is None:
        raise HTTPException(status_code=202, detail=f"Transcript not ready yet: {meeting.status}")
    return transcript


# ── Task 5.3 — Summary (decisions, action items, flags) ────────────────
@router.get("/meeting/{meeting_id}/summary")
def get_meeting_summary(meeting_id: str, db: Session = Depends(get_db)) -> dict:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if meeting is None:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")

    summary = _load_json(f"summaries/{meeting_id}.json")
    if summary is None:
        raise HTTPException(status_code=202, detail=f"Summary not ready yet: {meeting.status}")
    return summary


# ── Task 7.2 — Export Report ────────────────────────────────────────────
@router.get("/meeting/{meeting_id}/export")
def export_meeting_report(meeting_id: str, db: Session = Depends(get_db)) -> Response:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if meeting is None:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")

    summary = _load_json(f"summaries/{meeting_id}.json")
    if summary is None:
        raise HTTPException(status_code=202, detail=f"Summary not ready yet: {meeting.status}")

    report = _build_report_markdown(meeting, summary)
    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in meeting.title).strip() or meeting.id
    filename = f"{safe_title.replace(' ', '_')}_report.md"

    logger.info(f"Meeting {meeting_id} report exported ({len(report)} bytes)")
    return Response(
        content=report,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_report_markdown(meeting: Meeting, summary: dict) -> str:
    lines = [
        f"# {meeting.title}",
        "",
        f"- **Project:** {meeting.project or '—'}",
        f"- **Date:** {meeting.date or '—'}",
        f"- **Duration:** {summary.get('duration', '—')}",
        f"- **Participants:** {', '.join(summary.get('participants', [])) or '—'}",
        f"- **Exported:** {datetime.utcnow().isoformat(timespec='seconds')}Z",
        "",
        "## Summary",
        "",
        summary.get("summary") or "_No summary available._",
        "",
    ]

    flags = summary.get("flags") or []
    if flags:
        lines += ["## AI Flags", ""]
        for f in flags:
            lines.append(f"- **[{f.get('severity', 'warning').upper()}] {f.get('type', 'flag')}:** {f.get('message', '')}")
        lines.append("")

    decisions = summary.get("decisions") or []
    lines += ["## Decisions", ""]
    if decisions:
        for d in decisions:
            title = d.get("title") or d.get("text") or "Untitled decision"
            lines.append(f"### {title}")
            lines.append(f"- **Confidence:** {d.get('confidence', '—')}")
            if d.get("reason"):
                lines.append(f"- **Reason:** {d['reason']}")
            if d.get("evidence"):
                lines.append(f"- **Evidence:** {d['evidence']}")
            lines.append(f"- **When:** {d.get('timestamp', '—')} — {d.get('speaker', '—')}")
            lines.append("")
    else:
        lines += ["_No decisions recorded._", ""]

    action_items = summary.get("action_items") or []
    lines += ["## Action Items", ""]
    if action_items:
        for a in action_items:
            deadline = f" (due {a['deadline']})" if a.get("deadline") else ""
            lines.append(f"- [{a.get('priority', 'medium')}] {a.get('task', '')} — **{a.get('assignee', 'Unassigned')}**{deadline}")
        lines.append("")
    else:
        lines += ["_No action items recorded._", ""]

    risks = summary.get("risks") or []
    if risks:
        lines += ["## Risks", ""]
        lines += [f"- {r}" for r in risks]
        lines.append("")

    return "\n".join(lines)


def _load_json(relative_path: str) -> dict | None:
    """Best-effort read of a StorageService-saved JSON file. None if the
    meeting hasn't reached that pipeline stage yet."""
    try:
        return json.loads(storage.get_file(relative_path))
    except FileNotFoundError:
        return None
