from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.logger import get_logger

logger = get_logger("app.error")


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        f"Unhandled error on {request.method} {request.url.path}: {exc}",
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
