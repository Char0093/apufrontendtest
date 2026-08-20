from pathlib import Path

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.core.logger import get_logger
from app.database.session import SessionLocal
from app.graph import contradiction_service, graph_builder
from app.models.meeting import Meeting, ProcessingTask
from app.schemas.meeting_intelligence import (
    ActionItem,
    Decision,
    MeetingIntelligence,
    TranscriptLine,
)
from app.services import asr_service, embedding_service, gemini_service, vision_service
from app.services.storage_service import StorageService

logger = get_logger("app.tasks", worker=True)
settings = get_settings()
storage = StorageService()

# Matches app.api.meetings.ALLOWED_EXTENSIONS' only video format — Vision
# (nameplate reading) only makes sense for uploads that actually have video.
_VIDEO_EXTENSIONS = (".mp4",)


def _get_or_create_task_record(db, meeting_id: str) -> ProcessingTask:
    task_record = db.query(ProcessingTask).filter(ProcessingTask.meeting_id == meeting_id).first()
    if task_record is None:
        task_record = ProcessingTask(meeting_id=meeting_id)
        db.add(task_record)
    return task_record


def _analyze_transcript(
    meeting: Meeting,
    segments: list[dict],
    on_progress,
    name_timestamps: dict | None = None,
    all_detected_names: list[str] | None = None,
) -> MeetingIntelligence:
    """Gemini extraction through contradiction detection — the part of the
    pipeline that's identical whether segments came from a Deepgram REST
    transcription of an uploaded file, or from a live call
    (app/api/live_meeting.py). No demo_mode branch here on purpose: that's
    _run_pipeline's job below, for the "no file at all" case — a live
    session always has real segments, so it always runs for real, relying
    on gemini_service's own multi-provider fallback chain for resilience
    rather than substituting unrelated canned data over a real conversation.
    """
    name_timestamps = name_timestamps or {}
    all_detected_names = all_detected_names or []
    transcript_text = "\n".join(f"[{s['timestamp']}] {s['speaker']}: {s['text']}" for s in segments)

    on_progress(60, "Extracting decisions and action items (Gemini)...")
    analysis_dict = gemini_service.run_gemini_analysis(transcript_text, all_detected_names)
    ai_speaker_map = {
        spk: name
        for spk, name in analysis_dict.get("speaker_map", {}).items()
        if name and "unknown" not in name.lower() and "speaker" not in name.lower()
    }
    speaker_map = vision_service.map_speakers_to_names(segments, name_timestamps, ai_speaker_map)
    for seg in segments:
        seg["speaker"] = speaker_map.get(seg["speaker"], speaker_map.get(seg.get("speaker_raw", ""), seg["speaker"]))

    # Apply PyTorch + SentenceTransformers sentence logic matching
    try:
        from app.services import sentence_nlp_service
        aligned_decisions = sentence_nlp_service.align_decisions_with_transcript_quotes(
            analysis_dict.get("decisions", []), segments
        )
        grouped_action_items = sentence_nlp_service.group_action_items_by_semantic_topic(
            analysis_dict.get("action_items", [])
        )
    except Exception as nlp_err:
        logger.warning(f"Sentence NLP layer notice: {nlp_err}")
        aligned_decisions = analysis_dict.get("decisions", [])
        grouped_action_items = analysis_dict.get("action_items", [])

    last_sec = max((s.get("start", 0) for s in segments), default=0)
    h, m, sec = int(last_sec // 3600), int((last_sec % 3600) // 60), int(last_sec % 60)

    intelligence = MeetingIntelligence(
        meeting_id=meeting.id,
        duration=f"{h:02d}:{m:02d}:{sec:02d}",
        summary=analysis_dict.get("summary", ""),
        participants=analysis_dict.get("participants", list(set(speaker_map.values()))),
        speaker_map=speaker_map,
        transcript=[
            TranscriptLine(
                timestamp=s["timestamp"],
                speaker=s["speaker"],
                speaker_raw=s.get("speaker_raw", ""),
                text=s["text"],
            )
            for s in segments
        ],
        decisions=[
            Decision(
                **{
                    **d,
                    "speaker": vision_service.resolve_to_full_canonical_name(speaker_map.get(d.get("speaker", ""), d.get("speaker", "")), all_detected_names),
                    "evidence": (
                        d.get("evidence") and (
                            lambda ev: [
                                (ev := __import__("re").sub(rf"\b{spk}\b", name, ev))
                                for spk, name in speaker_map.items()
                                if name and "speaker" not in name.lower()
                            ] and ev
                        )(d.get("evidence"))
                    ) or d.get("evidence", "")
                }
            )
            for d in aligned_decisions
        ],
        action_items=[
            ActionItem(
                **{
                    **a,
                    "assignee": vision_service.resolve_to_full_canonical_name(speaker_map.get(a.get("assignee", ""), a.get("assignee", "")), all_detected_names)
                }
            )
            for a in grouped_action_items
        ],
        flags=[],
        risks=analysis_dict.get("risks", []),
        knowledge_triples=analysis_dict.get("knowledge_triples", []),
    )

    on_progress(75, "Indexing decisions to vector store...")
    embedding_service.index_meeting(meeting.id, meeting.title, intelligence)

    on_progress(85, "Checking for organizational contradictions...")
    try:
        intelligence.flags = contradiction_service.check_decisions(meeting.id, intelligence.decisions[:3])
    except Exception as ce:
        logger.warning(f"Contradiction check notice: {ce}")
        intelligence.flags = []

    return intelligence


def _run_pipeline(meeting: Meeting, on_progress) -> MeetingIntelligence:
    """Runs the Phase 2-4 pipeline for one uploaded-file meeting (ASR ->
    Vision -> _analyze_transcript). Raises on failure; _process_meeting owns
    all DB status/retry handling."""
    if settings.demo_mode:
        on_progress(20, "Running demo pipeline (DEMO_MODE=true, no API calls)...")
        graph_builder.seed_demo_history()
        intelligence = gemini_service.demo_meeting_intelligence(meeting.id)
        on_progress(90, "Demo data ready")
        return intelligence

    raw_path = str((storage.base_path / meeting.file_path).resolve())
    audio_path = str(storage.base_path / "audio" / f"{meeting.id}.wav")

    import gc

    on_progress(15, "Extracting audio (ffmpeg: video → 16kHz WAV)...")
    audio_path = asr_service.extract_audio(raw_path, audio_path)
    gc.collect()

    on_progress(35, "Speaker diarization & Deepgram transcription...")
    segments = asr_service.run_deepgram_transcription(audio_path)
    gc.collect()

    on_progress(55, "Aligning speech segments...")
    name_timestamps: dict = {}
    if Path(raw_path).suffix.lower() in _VIDEO_EXTENSIONS:
        on_progress(65, "Gemini Vision reading nameplates...")
        try:
            name_timestamps = vision_service.extract_names_from_video(raw_path)
        except Exception as ve:
            logger.warning(f"Vision name extraction skipped: {ve}")
        gc.collect()

    all_detected_names = list({n for names in name_timestamps.values() for n in names})

    res = _analyze_transcript(meeting, segments, on_progress, name_timestamps, all_detected_names)
    gc.collect()
    return res


def _save_and_graph(meeting: Meeting, intelligence: MeetingIntelligence) -> None:
    """Persist transcript/summary (StorageService, Task 1.1) and build the
    graph (Task 4.3), then write any CONTRADICTS edges (Task 4.4) now that
    this meeting's own Decision nodes exist."""
    storage.save_transcript(meeting.id, {
        "meeting_id": meeting.id,
        "transcript": [line.model_dump() for line in intelligence.transcript],
    })
    storage.save_summary(meeting.id, {
        "duration": intelligence.duration,
        "summary": intelligence.summary,
        "participants": intelligence.participants,
        "decisions": [d.model_dump() for d in intelligence.decisions],
        "action_items": [a.model_dump() for a in intelligence.action_items],
        "flags": [f.model_dump() for f in intelligence.flags],
        "risks": intelligence.risks,
        "knowledge_triples": [triple.model_dump() for triple in intelligence.knowledge_triples],
    })

    try:
        graph_builder.build_from_meeting(meeting.id, meeting.title, meeting.project, intelligence)

        for flag in intelligence.flags:
            if flag.source_decision_text and flag.contradicts_meeting_id and flag.contradicts_decision_text:
                from_id = graph_builder.decision_node_id(meeting.id, flag.source_decision_text)
                to_id = graph_builder.decision_node_id(flag.contradicts_meeting_id, flag.contradicts_decision_text)
                graph_builder.write_contradiction(from_id, to_id, flag.message)
    except Exception as exc:
        logger.warning(f"Neo4j graph sync skipped for meeting {meeting.id} (Neo4j service offline): {exc}")


def _process_meeting(task, meeting_id: str, run_pipeline) -> None:
    """Generic status/retry shell shared by process_meeting_task and
    process_live_meeting_task below — the only thing that differs between
    an upload and a live call is how MeetingIntelligence gets produced."""
    retries = task.request.retries if (task and hasattr(task, 'request') and hasattr(task.request, 'retries')) else 0
    logger.info(f"Processing meeting {meeting_id} (attempt {retries + 1})")
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting is None:
            logger.error(f"Meeting {meeting_id} not found, aborting task")
            return

        task_record = _get_or_create_task_record(db, meeting_id)
        task_record.status = "processing"
        task_record.retry_count = retries
        meeting.status = "processing"
        meeting.progress = 5
        db.commit()

        def on_progress(pct: int, message: str) -> None:
            meeting.progress = pct
            db.commit()
            logger.info(f"[{meeting_id}] {pct}% — {message}")

        intelligence = run_pipeline(meeting, on_progress)
        
        on_progress(95, "Saving meeting intelligence and building memory graph...")
        _save_and_graph(meeting, intelligence)

        task_record.status = "completed"
        meeting.status = "completed"
        meeting.progress = 100
        db.commit()
        logger.info(
            f"Meeting {meeting_id} processing complete — {len(intelligence.decisions)} decisions, "
            f"{len(intelligence.action_items)} action items, {len(intelligence.flags)} flags"
        )

    except Exception as exc:
        db.rollback()
        print(f"[PIPELINE ERROR] >> Meeting {meeting_id} failed: {exc}", flush=True)
        logger.error(f"Meeting {meeting_id} processing failed: {exc}", exc_info=True)

        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        task_record = _get_or_create_task_record(db, meeting_id)
        task_record.error_message = str(exc)
        
        has_celery = bool(task and hasattr(task, 'request') and hasattr(task.request, 'retries'))
        retries_count = task.request.retries if has_celery else 0
        task_record.retry_count = retries_count

        is_final_attempt = (task.request.retries >= task.max_retries) if has_celery else True
        task_record.status = "failed" if is_final_attempt else "retrying"
        if meeting is not None:
            meeting.status = "failed" if is_final_attempt else "retrying"
            meeting.progress = 0
        db.commit()

        if is_final_attempt:
            logger.error(f"Meeting {meeting_id} failed permanently: {exc}")
        elif has_celery:
            raise task.retry(exc=exc, countdown=2**task.request.retries)
    finally:
        db.close()


@celery_app.task(bind=True, name="process_meeting_task", max_retries=2)
def process_meeting_task(self, meeting_id: str) -> None:
    _process_meeting(self, meeting_id, _run_pipeline)


@celery_app.task(bind=True, name="process_live_meeting_task", max_retries=2)
def process_live_meeting_task(self, meeting_id: str) -> None:
    """Entry point for a finished live call (app/api/live_meeting.py). Takes
    only the id — segments were already persisted via
    StorageService.save_live_segments before this was dispatched, so the
    Celery/Redis payload stays small regardless of call length."""

    def run_pipeline(meeting: Meeting, on_progress) -> MeetingIntelligence:
        segments = storage.get_live_segments(meeting_id)
        return _analyze_transcript(meeting, segments, on_progress)

    _process_meeting(self, meeting_id, run_pipeline)

def run_meeting_pipeline_direct(meeting_id: str) -> None:
    """Runs the pipeline directly in FastAPI BackgroundTasks without needing a Celery daemon."""
    _process_meeting(None, meeting_id, _run_pipeline)


def run_live_meeting_pipeline_direct(meeting_id: str) -> None:
    """Runs live meeting analysis directly in FastAPI BackgroundTasks."""
    def run_pipeline(meeting: Meeting, on_progress) -> MeetingIntelligence:
        segments = storage.get_live_segments(meeting_id)
        return _analyze_transcript(meeting, segments, on_progress)

    _process_meeting(None, meeting_id, run_pipeline)
