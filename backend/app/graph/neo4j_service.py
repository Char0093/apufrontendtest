"""Neo4j connection service (Task 4.1)."""
from contextlib import contextmanager

from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        try:
            _driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_username, settings.neo4j_password),
            )
        except ServiceUnavailable as exc:
            logger.error(f"Neo4j driver could not be created ({settings.neo4j_uri}): {exc}")
            raise
    return _driver


@contextmanager
def get_session():
    session = get_driver().session()
    try:
        yield session
    finally:
        session.close()


def run_query(cypher: str, **params) -> list[dict]:
    """Run a Cypher query, return a list of record dicts."""
    try:
        with get_session() as session:
            result = session.run(cypher, **params)
            return [record.data() for record in result]
    except (ServiceUnavailable, Neo4jError) as exc:
        logger.error(f"Neo4j query failed: {exc}\nCypher: {cypher}\nParams: {params}")
        raise


def close_driver() -> None:
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None
