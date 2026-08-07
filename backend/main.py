from fastapi import FastAPI

from backend.config import get_settings

settings = get_settings()

app = FastAPI(title="Corporate Brain API")


@app.get("/")
def root() -> dict:
    return {"service": "Corporate Brain API", "status": "ok"}


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}
