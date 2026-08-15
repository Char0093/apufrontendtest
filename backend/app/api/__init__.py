from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.livekit import router as livekit_router
from app.api.meetings import router as meetings_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(livekit_router)
api_router.include_router(meetings_router)
