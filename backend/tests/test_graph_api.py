"""Regression tests for the /graph and /meeting/{id}/graph-data endpoints:
every link's source/target must correspond to a node actually present in
the same response's nodes array, or react-force-graph-2d's d3-force layer
throws "node not found" and the frontend Memory Graph fails to render.

Each fixture below mocks app.graph.neo4j_service.run_query with a
side_effect list matching the exact, fixed order the endpoint issues its
Cypher queries in. The CONTRADICTS row deliberately references a decision
id ("d2") absent from the earlier decisions-query fixture, reproducing:

  - get_meeting_graph_data: a CONTRADICTS edge always points at "other", a
    Decision that may belong to a different meeting than the one this
    endpoint scopes its own decision-gathering query to — so it's *never*
    in `nodes` unless added explicitly.
  - get_global_graph_data: each Cypher query runs as its own independent
    Neo4j auto-commit transaction (see neo4j_service.run_query), so a
    decision + CONTRADICTS edge committed by a concurrent meeting-processing
    task between the "decisions" query and the "contradicts" query would be
    picked up by the latter but missed by the former.
"""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.session import Base, get_db
from app.main import app
from app.models.employee import Employee

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)


def _auth_headers(db_session) -> dict:
    # Management bypasses require_meeting_access's per-meeting participant
    # check (see app/core/auth.py) — these tests exercise dangling-link
    # shape, not the access-control layer, which has its own coverage in
    # test_endpoint_auth.py.
    emp = Employee(name="Graph Tester", email="graph.tester@example.com", is_management=True)
    db_session.add(emp)
    db_session.commit()
    return {"X-User-Name": emp.name}


def _assert_no_dangling_links(payload: dict) -> None:
    node_ids = {n["id"] for n in payload["nodes"]}
    dangling = [
        link for link in payload["links"]
        if link["source"] not in node_ids or link["target"] not in node_ids
    ]
    assert not dangling, f"link(s) reference a node missing from nodes[]: {dangling}"


def test_global_graph_data_has_no_dangling_links_under_concurrent_write(db_session):
    responses = [
        [{"id": "m1", "title": "Meeting One"}],                      # meetings
        [],                                                            # PARTICIPATED_IN
        [{"id": "d1", "text": "Decision One", "meeting_id": "m1", "speaker": None}],  # decisions
        [],                                                            # action items
        [],                                                            # meeting-RELATES_TO-project
        [],                                                            # decision-RELATES_TO-project
        [{"from_id": "d1", "from_text": "Decision One", "to_id": "d2",
          "to_text": "Decision Two (written concurrently)", "message": "conflict"}],  # CONTRADICTS
    ]
    with patch("app.graph.neo4j_service.run_query", side_effect=responses):
        response = client.get("/graph", headers=_auth_headers(db_session))

    assert response.status_code == 200
    payload = response.json()
    _assert_no_dangling_links(payload)
    assert {"decision:d1", "decision:d2"} <= {n["id"] for n in payload["nodes"]}


def test_meeting_graph_data_has_no_dangling_links_for_cross_meeting_contradiction(db_session):
    responses = [
        [{"id": "m1", "title": "Meeting One"}],                      # meeting lookup
        [],                                                            # participants
        [{"id": "d1", "text": "Decision One", "speaker": None}],       # decisions (this meeting only)
        [],                                                            # action items
        [],                                                            # meeting-RELATES_TO-project
        [],                                                            # decision-RELATES_TO-project
        [{"from_id": "d1", "to_id": "d2", "to_text": "External Decision", "message": "conflict"}],  # CONTRADICTS
    ]
    with patch("app.graph.neo4j_service.run_query", side_effect=responses):
        response = client.get("/meeting/m1/graph-data", headers=_auth_headers(db_session))

    assert response.status_code == 200
    payload = response.json()
    _assert_no_dangling_links(payload)
    assert {"decision:d1", "decision:d2"} <= {n["id"] for n in payload["nodes"]}
