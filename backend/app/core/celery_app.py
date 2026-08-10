from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "corporate_brain",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.meeting_tasks"],
)
