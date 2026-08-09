from fastapi import FastAPI

from app.core.config import get_settings
from app.core.logger import get_logger

settings = get_settings()
logger = get_logger(__name__)

app = FastAPI(title="Corporate Brain API")
logger.info("Corporate Brain API starting")


@app.get("/")
def root() -> dict:
    return {"service": "Corporate Brain API", "status": "ok"}


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}
