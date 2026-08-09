from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def root() -> dict:
    return {"service": "Corporate Brain API", "status": "ok"}


@router.get("/health")
def health_check() -> dict:
    return {"status": "ok"}
