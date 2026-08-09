from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import get_settings
from app.core.exceptions import unhandled_exception_handler
from app.core.logger import get_logger
from app.core.middleware import log_requests

settings = get_settings()
logger = get_logger(__name__)

app = FastAPI(title="Corporate Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(log_requests)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(api_router)

logger.info("Corporate Brain API starting")
