from pydantic import BaseModel
import json
import secrets
from pathlib import Path

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_employee
from app.core.logger import get_logger
from app.database.session import get_db
from app.models.employee import Employee
from app.models.meeting import Meeting, MeetingInvite, ProcessingTask
from app.models.notification import NotificationRecord
from app.schemas.meeting import (
    MeetingCreate,
    MeetingCreateResponse,
    MeetingListItem,
    MeetingStatusResponse,
    RsvpRequest,
)
from app.services.storage_service import StorageService
from app.tasks.meeting_tasks import process_meeting_task, run_meeting_pipeline_direct

router = APIRouter()
logger = get_logger(__name__)
storage = StorageService()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4"}


def _generate_room_code(db: Session, attempts: int = 5) -> str:
    for _ in range(attempts):
        code = f"CORP-{secrets.token_hex(2).upper()}"
        if not db.query(Meeting).filter_by(room_id=code).first():
            return code
    raise HTTPException(status_code=503, detail="Could not generate a unique room code, please retry")


@router.post("/meetings", response_model=MeetingListItem)
def create_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> MeetingListItem:
    """Schedules a meeting and invites its participants. The meeting row and
    every invitee's RSVP live in the backend from the moment this returns,
    so every device viewing this caller's (or an invitee's) account sees the
    same schedule — unlike the old client-only version of this action."""
    original_by_lower = {n.strip().lower(): n.strip() for n in payload.participant_names if n.strip()}
    invitee_names = set(original_by_lower) - {caller.name.lower()}
    invitees: list[Employee] = []
    if invitee_names:
        invitees = db.query(Employee).filter(func.lower(Employee.name).in_(invitee_names)).all()
        missing = invitee_names - {e.name.lower() for e in invitees}
        if missing:
            missing_original = sorted(original_by_lower[name] for name in missing)
            raise HTTPException(status_code=400, detail=f"Unknown participant(s): {missing_original}")

    room_id = _generate_room_code(db)
    meeting = Meeting(
        title=payload.title,
        project=payload.project,
        date=payload.date,
        time_range=payload.time_range,
        department=payload.department,
        source="scheduled",
        room_id=room_id,
        status="scheduled",
        host_name=caller.name,
    )
    db.add(meeting)
    db.flush()

    db.add(MeetingInvite(meeting_id=meeting.id, employee_id=caller.id, rsvp_status="accepted"))
    when = f" scheduled for {payload.date}" + (f" at {payload.time_range.split(' - ')[0]}" if payload.time_range else "") if payload.date else ""
    for employee in invitees:
        db.add(MeetingInvite(meeting_id=meeting.id, employee_id=employee.id, rsvp_status="pending"))
        db.add(NotificationRecord(
            employee_id=employee.id,
            title="Meeting Invitation",
            message=f'{caller.name} invited you to "{payload.title}"{when}.',
            category="meeting",
            type="INVITATION",
            meeting_id=meeting.id,
            sender_name=caller.name,
            target_tab="dashboard",
        ))

    db.commit()
    db.refresh(meeting)
    logger.info(f"Meeting {meeting.id} scheduled by {caller.name} with {len(invitees)} invitee(s)")

    return MeetingListItem(
        id=meeting.id,
        title=meeting.title,
        project=meeting.project,
        date=meeting.date,
        status=meeting.status,
        progress=0,
        source=meeting.source,
        room_id=meeting.room_id,
        time_range=meeting.time_range,
        department=meeting.department,
        host_name=meeting.host_name,
        rsvp_status="accepted",
        participant_names=[caller.name] + [e.name for e in invitees],
    )


@router.post("/meetings/{meeting_id}/rsvp", status_code=204)
def set_rsvp(
    meeting_id: str,
    payload: RsvpRequest,
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> Response:
    invite = db.query(MeetingInvite).filter_by(meeting_id=meeting_id, employee_id=caller.id).first()
    if invite is None:
        raise HTTPException(status_code=404, detail="No invitation found for this meeting")
    invite.rsvp_status = payload.status
    db.commit()
    return Response(status_code=204)


@router.post("/upload", response_model=MeetingCreateResponse, status_code=202)
async def upload_meeting(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    project: str | None = Form(None),
    db: Session = Depends(get_db),
) -> MeetingCreateResponse:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {ext or '(none)'}")

    meeting_title = title or Path(file.filename).stem
    meeting = Meeting(title=meeting_title, project=project, status="queued", source="upload")
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    import shutil
    raw_dir = storage.base_path / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    clean_name = Path(file.filename or "recording.mp4").name
    dest_path = raw_dir / f"{meeting.id}_{clean_name}"
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer, length=1024 * 1024)
    
    relative_path = f"raw/{meeting.id}_{clean_name}"
    meeting.file_path = relative_path
    db.commit()

    # Launch directly in FastAPI BackgroundTasks (immediate execution without Celery daemon)
    background_tasks.add_task(run_meeting_pipeline_direct, meeting.id)
    logger.info(f"Meeting {meeting.id} uploaded ({clean_name}), started direct background processing")

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
    caller: Employee = Depends(get_current_employee),
) -> list[MeetingListItem]:
    query = db.query(Meeting)
    if keyword:
        query = query.filter(Meeting.title.ilike(f"%{keyword}%"))
    if project:
        query = query.filter(Meeting.project == project)
    if date:
        query = query.filter(Meeting.date == date)

    # This caller's own RSVP per meeting (for "Upcoming Invitations"), and
    # every invitee's name per meeting (so a card can show who else was
    # invited, not just the caller's own status) — one join query for every
    # meeting this request will consider, not one query per meeting.
    invite_status_by_meeting: dict[str, str] = {
        inv.meeting_id: inv.rsvp_status
        for inv in db.query(MeetingInvite).filter_by(employee_id=caller.id)
    }
    participant_names_by_meeting: dict[str, list[str]] = {}
    for invite, employee_name in (
        db.query(MeetingInvite, Employee.name)
        .join(Employee, Employee.id == MeetingInvite.employee_id)
        .all()
    ):
        participant_names_by_meeting.setdefault(invite.meeting_id, []).append(employee_name)

    items: list[MeetingListItem] = []
    for meeting in query.order_by(Meeting.created_at.desc()).all():
        # A declined invitation shouldn't keep showing up as a pending one.
        if invite_status_by_meeting.get(meeting.id) == "declined":
            continue

        summary = _load_json(f"summaries/{meeting.id}.json")
        if summary is not None and meeting.status.lower() in ["processing", "queued", "preprocessing", "asr", "llm", "graph"]:
            meeting.status = "completed"
            meeting.progress = 100
            db.commit()
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
            source=meeting.source,
            room_id=meeting.room_id,
            time_range=meeting.time_range,
            department=meeting.department,
            host_name=meeting.host_name,
            rsvp_status=invite_status_by_meeting.get(meeting.id),
            participant_names=participant_names_by_meeting.get(meeting.id, []),
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


class AnalyzeTranscriptRequest(BaseModel):
    transcript: list[dict]
    detected_names: list[str] = []


@router.post("/analyze-transcript")
@router.post("/meetings/analyze-transcript")
def analyze_transcript_endpoint(req: AnalyzeTranscriptRequest):
    from app.services import gemini_service

    if not req.transcript:
        return {
            "summary": "Meeting concluded without transcript dialogue.",
            "participants": req.detected_names,
            "decisions": [],
            "action_items": [],
            "knowledge_triples": [],
            "risks": []
        }

    transcript_text = "\n".join(
        f"[{line.get('timestamp', '00:00:00')}] {line.get('speaker', 'Speaker')}: {line.get('text', '')}"
        for line in req.transcript
    )

    try:
        analysis = gemini_service.run_gemini_analysis(transcript_text, req.detected_names)
        return analysis
    except Exception as exc:
        logger.warning(f"AI transcript analysis fallback triggered: {exc}")
        all_speakers = list(dict.fromkeys([line.get("speaker", "Speaker") for line in req.transcript if line.get("speaker")]))
        full_text = " ".join([line.get("text", "") for line in req.transcript])
        
        return {
            "summary": f"Discussion between {', '.join(all_speakers)}: {full_text[:200]}..." if len(full_text) > 200 else f"Discussion between {', '.join(all_speakers)}: {full_text}",
            "participants": all_speakers,
            "decisions": [],
            "action_items": [],
            "knowledge_triples": [{"subject": spk, "predicate": "PARTICIPATED_IN", "object": "Live Session"} for spk in all_speakers],
            "risks": []
        }


@router.delete("/meeting/{meeting_id}", status_code=200)
def delete_meeting(meeting_id: str, db: Session = Depends(get_db)) -> dict:
    from app.graph import graph_builder
    from app.services import embedding_service

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if meeting is not None:
        # Delete task records
        db.query(ProcessingTask).filter(ProcessingTask.meeting_id == meeting_id).delete()
        # Delete Meeting row
        db.delete(meeting)
        db.commit()

    # Delete storage artifacts
    storage.delete_meeting_files(meeting_id)

    # Delete graph nodes & edges from Neo4j
    try:
        graph_builder.delete_meeting_nodes(meeting_id)
    except Exception as e:
        logger.warning(f"Failed to delete meeting {meeting_id} from Neo4j: {e}")

    # Delete vector embeddings from ChromaDB
    try:
        embedding_service.delete_meeting(meeting_id)
    except Exception as e:
        logger.warning(f"Failed to delete meeting {meeting_id} from ChromaDB: {e}")

    logger.info(f"Meeting {meeting_id} deleted successfully from database, Neo4j, ChromaDB, and storage")
    return {"status": "deleted", "meeting_id": meeting_id}
