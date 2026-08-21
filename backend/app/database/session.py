from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings
from app.core.logger import get_logger

settings = get_settings()
logger = get_logger(__name__)

_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite")
    else {
        # Bounds only the initial TCP handshake/login — confirmed live that
        # this alone isn't enough: a request can hang past 25s even with
        # this set, because the connection succeeds but the query itself
        # never gets a response (a Neon compute that "resumed" but isn't
        # actually answering, a held lock, a half-dead connection with no
        # keepalive to notice). statement_timeout below is what actually
        # bounds that.
        "connect_timeout": 10,
        # Server-side cap on any single query, in ms — this is the one that
        # matters for a stuck-after-connect hang: Postgres itself cancels
        # the query and returns an error instead of the process blocking on
        # a response that may never come. Also bounds pool_pre_ping's own
        # check query, which would otherwise hang the same way on a
        # connection that looks alive but isn't answering.
        "options": "-c statement_timeout=15000",
        # TCP keepalives so a connection whose peer vanished without a
        # clean close (dropped mid-session, not just idle) gets detected
        # and killed within ~30s instead of sitting open forever.
        "keepalives": 1,
        "keepalives_idle": 10,
        "keepalives_interval": 5,
        "keepalives_count": 3,
    }
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
    # Confirmed live this is what was actually happening: SQLAlchemy's
    # default pool (size 5 + overflow 10 = 15) was fully exhausted, and
    # every further request queued for the default pool_timeout (30s)
    # before failing with "QueuePool limit ... reached, connection timed
    # out, timeout 30.00" -- not a slow/unreachable database, a pool that
    # was too small for how many concurrent requests this app legitimately
    # fires (list_meetings' per-meeting summary/transcript/graph fan-out
    # was the main driver -- see the fix in refreshMeetingsFromBackend).
    # Doubling capacity here is a second line of defense, not the primary
    # fix.
    pool_size=10,
    max_overflow=10,
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
