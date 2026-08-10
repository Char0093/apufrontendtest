from app.core.celery_app import celery_app
from app.core.logger import get_logger

logger = get_logger("app.tasks", worker=True)


@celery_app.task(name="process_meeting_task")
def process_meeting_task(meeting_id: str) -> None:
    logger.info(f"Processing meeting {meeting_id}")
