from fastapi import APIRouter

from app.api.dashboard import router as dashboard_router
from app.api.graph import router as graph_router
from app.api.health import router as health_router
from app.api.livekit import router as livekit_router
from app.api.meetings import router as meetings_router
from app.api.query import router as query_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(livekit_router)
api_router.include_router(meetings_router)
api_router.include_router(graph_router)
api_router.include_router(query_router)
api_router.include_router(dashboard_router)
