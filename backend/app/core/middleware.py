import time

from fastapi import Request

from app.core.logger import get_logger

logger = get_logger("app.request")


async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.error(
            f"{request.method} {request.url.path} -> 500 ({duration_ms:.1f}ms) [unhandled exception]"
        )
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    message = f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms:.1f}ms)"
    if response.status_code >= 500:
        logger.error(message)
    else:
        logger.info(message)
    return response
