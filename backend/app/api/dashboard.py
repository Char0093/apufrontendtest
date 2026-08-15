from fastapi import APIRouter, HTTPException

from app.services import dashboard_service

router = APIRouter()


@router.get("/users/{user_id}/dashboard")
def get_user_dashboard(user_id: str) -> dict:
    try:
        return dashboard_service.get_dashboard(user_id)
    except Exception:
        raise HTTPException(status_code=503, detail="The meeting graph is unavailable")
