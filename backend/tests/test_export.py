"""Tests for GET /meeting/{id}/export (Task 7.2)."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import meetings as meetings_module
from app.database.session import Base, get_db
from app.main import app
from app.models.employee import Employee
from app.models.meeting import Meeting


@pytest.fixture
def db_session():
    # StaticPool pins every connection from this engine to the same
    # underlying sqlite3 connection — without it, each new Session opens a
    # *separate* (and separately empty) ":memory:" database, so tables
    # created via create_all() below wouldn't be visible to the session the
    # overridden get_db() dependency hands the route handler.
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


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _auth_headers(db_session) -> dict:
    # Management bypasses require_meeting_access's per-meeting participant
    # check (see app/core/auth.py) — these tests exercise export's content
    # and status-code logic, not the access-control layer, which has its
    # own coverage in test_endpoint_auth.py.
    emp = Employee(name="Export Tester", email="export.tester@example.com", is_management=True)
    db_session.add(emp)
    db_session.commit()
    return {"X-User-Name": emp.name}


FAKE_SUMMARY = {
    "duration": "00:15:20",
    "summary": "The team selected Provider X for Q4.",
    "participants": ["Sarah Park", "Tom Wright"],
    "decisions": [
        {
            "title": "Switch primary vendor to Provider X",
            "confidence": "firm_commitment",
            "reason": "Best cost/SLA tradeoff.",
            "evidence": "22% savings over 36 months.",
            "timestamp": "00:11:05",
            "speaker": "Sarah Park",
        }
    ],
    "action_items": [
        {"task": "Complete security audit", "assignee": "Tom Wright", "deadline": "2026-08-20", "priority": "high"}
    ],
    "flags": [
        {"type": "contradiction", "severity": "warning", "message": "Conflicts with the May vendor freeze."}
    ],
    "risks": ["Migration window overlaps Project Alpha's Q4 deadline."],
}


def test_export_meeting_not_found_returns_404(client, db_session):
    response = client.get("/meeting/does-not-exist/export", headers=_auth_headers(db_session))
    assert response.status_code == 404


def test_export_summary_not_ready_returns_202(client, db_session, monkeypatch):
    meeting = Meeting(title="Unprocessed Meeting", status="processing")
    db_session.add(meeting)
    db_session.commit()

    monkeypatch.setattr(
        meetings_module.storage, "get_file", lambda path: (_ for _ in ()).throw(FileNotFoundError())
    )

    response = client.get(f"/meeting/{meeting.id}/export", headers=_auth_headers(db_session))
    assert response.status_code == 202


def test_export_returns_markdown_report_with_download_headers(client, db_session, monkeypatch):
    meeting = Meeting(title="Q3 Vendor Review", project="Core Infrastructure", date="2026-08-08", status="completed")
    db_session.add(meeting)
    db_session.commit()

    import json

    monkeypatch.setattr(
        meetings_module.storage, "get_file", lambda path: json.dumps(FAKE_SUMMARY)
    )

    response = client.get(f"/meeting/{meeting.id}/export", headers=_auth_headers(db_session))

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert "attachment;" in response.headers["content-disposition"]
    assert "Q3_Vendor_Review" in response.headers["content-disposition"]

    body = response.text
    assert "# Q3 Vendor Review" in body
    assert "Switch primary vendor to Provider X" in body
    assert "Tom Wright" in body
    assert "Conflicts with the May vendor freeze" in body
    assert "Migration window overlaps" in body


def test_build_report_markdown_handles_empty_sections():
    meeting = Meeting(title="Empty Meeting", project=None, date=None)
    report = meetings_module._build_report_markdown(
        meeting,
        {"duration": "—", "summary": "", "participants": [], "decisions": [], "action_items": [], "flags": [], "risks": []},
    )
    assert "# Empty Meeting" in report
    assert "_No decisions recorded._" in report
    assert "_No action items recorded._" in report
