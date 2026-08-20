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
from app.database.session import Base, SessionLocal, engine
from app.graph import graph_builder
from app.models import meeting as _meeting_models  # noqa: F401 - registers models on Base
from app.models import employee as _employee_models  # noqa: F401 - registers models on Base
from app.models import notification as _notification_models  # noqa: F401 - registers models on Base
from app.models import message as _message_models  # noqa: F401 - registers models on Base
from app.models import coco_chat as _coco_chat_models  # noqa: F401 - registers models on Base
from app.models.employee import Employee

settings = get_settings()
logger = get_logger(__name__)

Base.metadata.create_all(bind=engine)

# Demo employee directory — mirrors mockData.ts's INITIAL_EMPLOYEES_DATA, the
# frontend's actual login/demo-switcher roster. This is the backend's only
# source of role (is_management); request identity for the memory-graph
# endpoints is asserted via the X-User-Name header (see app/core/auth.py)
# and looked up here, not trusted directly. Keep this in sync by hand when
# the frontend roster changes.
_DEMO_EMPLOYEES = [
    ("Thim Yee Song", "thim.yeesong@corpbrain.ai", "VP of Product", True),
    ("Duncan", "duncan@corpbrain.ai", "VP of Engineering", True),
    ("Kam Xin Le", "kam.xinle@corpbrain.ai", "Head of Product", True),
    ("Yap En Yu", "yap.enyu@corpbrain.ai", "Chief Financial Officer", True),
]


def _seed_employees() -> None:
    """Upserts by name rather than a one-time "table is empty" check, so a
    roster change here still takes effect against an already-seeded DB."""
    db = SessionLocal()
    try:
        for name, email, title, is_management in _DEMO_EMPLOYEES:
            if db.query(Employee).filter(Employee.name == name).first() is None:
                db.add(Employee(name=name, email=email, title=title, is_management=is_management))
        db.commit()
    finally:
        db.close()


try:
    _seed_employees()
except Exception as e:
    logger.warning(f"Could not seed demo employees at startup: {e}")

try:
    graph_builder.ensure_constraints()
except Exception as e:
    logger.warning(f"Could not set up Neo4j constraints at startup (is Neo4j running?): {e}")

app = FastAPI(title="Corporate Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(log_requests)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(api_router)

logger.info("Corporate Brain API starting")
