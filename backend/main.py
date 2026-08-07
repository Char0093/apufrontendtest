from fastapi import FastAPI

app = FastAPI(title="Corporate Brain API")


@app.get("/")
def root() -> dict:
    return {"service": "Corporate Brain API", "status": "ok"}


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}
