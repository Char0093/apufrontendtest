from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.coco_history import router as coco_history_router
from app.api.dashboard import router as dashboard_router
from app.api.graph import router as graph_router
from app.api.health import router as health_router
from app.api.live_meeting import router as live_meeting_router
from app.api.livekit import router as livekit_router
from app.api.meetings import router as meetings_router
from app.api.messages import router as messages_router
from app.api.notifications import router as notifications_router
from app.api.query import router as query_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(health_router)
api_router.include_router(livekit_router)
api_router.include_router(live_meeting_router)
api_router.include_router(meetings_router)
api_router.include_router(graph_router)
api_router.include_router(notifications_router)
api_router.include_router(messages_router)
api_router.include_router(coco_history_router)
api_router.include_router(query_router)
api_router.include_router(dashboard_router)
