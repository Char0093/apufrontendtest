from app.core.celery_app import celery_app
from app.core.logger import get_logger
from app.database.session import SessionLocal
from app.models.meeting import Meeting, ProcessingTask

logger = get_logger("app.tasks", worker=True)


def _get_or_create_task_record(db, meeting_id: str) -> ProcessingTask:
    task_record = db.query(ProcessingTask).filter(ProcessingTask.meeting_id == meeting_id).first()
    if task_record is None:
        task_record = ProcessingTask(meeting_id=meeting_id)
        db.add(task_record)
    return task_record


@celery_app.task(bind=True, name="process_meeting_task", max_retries=2)
def process_meeting_task(self, meeting_id: str) -> None:
    logger.info(f"Processing meeting {meeting_id} (attempt {self.request.retries + 1})")
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting is None:
            logger.error(f"Meeting {meeting_id} not found, aborting task")
            return

        task_record = _get_or_create_task_record(db, meeting_id)
        task_record.status = "processing"
        task_record.retry_count = self.request.retries
        meeting.status = "processing"
        meeting.progress = 50
        db.commit()

        # Actual pipeline stages (preprocessing, ASR, diarization, Gemini
        # extraction, graph building) land in Phase 2-4 - this task will
        # orchestrate them once they exist.

        task_record.status = "completed"
        meeting.status = "completed"
        meeting.progress = 100
        db.commit()
        logger.info(f"Meeting {meeting_id} processing complete")

    except Exception as exc:
        db.rollback()
        logger.error(f"Meeting {meeting_id} processing failed: {exc}", exc_info=True)

        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        task_record = _get_or_create_task_record(db, meeting_id)
        task_record.error_message = str(exc)
        task_record.retry_count = self.request.retries

        is_final_attempt = self.request.retries >= self.max_retries
        task_record.status = "failed" if is_final_attempt else "retrying"
        if meeting is not None:
            meeting.status = "failed" if is_final_attempt else "retrying"
        db.commit()

        if is_final_attempt:
            logger.error(f"Meeting {meeting_id} failed after {self.request.retries + 1} attempts")
        else:
            raise self.retry(exc=exc, countdown=2**self.request.retries)
    finally:
        db.close()
