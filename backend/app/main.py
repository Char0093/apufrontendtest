import sys
import io
# Force UTF-8 output on Windows to prevent GBK codec errors from emoji in log messages
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import get_settings
from app.core.exceptions import unhandled_exception_handler
from app.core.logger import get_logger
from app.core.middleware import log_requests
from app.database.session import Base, engine
from app.graph import graph_builder
from app.models import meeting as _meeting_models  # noqa: F401 - registers models on Base

settings = get_settings()
logger = get_logger(__name__)

Base.metadata.create_all(bind=engine)

try:
    graph_builder.ensure_constraints()
except Exception as e:
    logger.warning(f"Could not set up Neo4j constraints at startup (is Neo4j running?): {e}")

app = FastAPI(title="Corporate Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Vite may bind to IPv6 loopback and browsers then use this origin.
        "http://[::1]:5173",
    ],
    # Development clients may open Vite through the host computer's private
    # LAN address. Public deployments should use explicit HTTPS origins.
    allow_origin_regex=(
        r"^https?://(?:localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])"
        r"(?:\.\d{1,3}){2})(?::\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(log_requests)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(api_router)

logger.info("Corporate Brain API starting")
