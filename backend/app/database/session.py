from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings
from app.core.logger import get_logger

settings = get_settings()
logger = get_logger(__name__)

_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite")
    # No timeout here meant a stalled/unreachable Postgres (a suspended
    # Neon compute that fails to resume, a stale connection string, a
    # network-level black hole) hung every DB-touching request forever,
    # with no error and no way for a caller to distinguish "still working"
    # from "will never respond" -- 10s fails fast with an actual error
    # instead of hanging indefinitely.
    else {"connect_timeout": 10}
)
engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    # Neon (and most managed Postgres) can silently drop idle connections
    # server-side; pool_pre_ping catches a dead pooled connection with a
    # cheap check before handing it to a request, instead of that request
    # failing (or, without the timeout above, hanging) on a connection
    # that looked fine but was already gone.
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as exc:
        logger.error(f"Unhandled DB session error: {exc}", exc_info=True)
        raise
    finally:
        db.close()
