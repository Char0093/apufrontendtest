"""Auth-gap regression tests. Several meeting/graph endpoints had no
Depends(get_current_employee) at all, meaning any unauthenticated caller who
knew (or guessed) a meeting_id could read its transcript/summary/export,
delete it outright, upload new recordings, or rewrite graph node labels.
Each test proves the gap is closed: no credentials -> 401, and a legitimate
caller still gets through."""
import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import graph as graph_module
from app.api import meetings as meetings_module
from app.database.session import Base, get_db
from app.main import app
from app.models.employee import Employee
from app.models.meeting import Meeting

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


def _make_employee(db_session, name="Casey Manager", is_management=True) -> Employee:
    emp = Employee(name=name, email=f"{name.lower().replace(' ', '.')}@example.com", is_management=is_management)
    db_session.add(emp)
    db_session.commit()
    db_session.refresh(emp)
    return emp


def _make_meeting(db_session, **kwargs) -> Meeting:
    kwargs.setdefault("status", "completed")
    meeting = Meeting(title="Q3 Planning", **kwargs)
    db_session.add(meeting)
    db_session.commit()
    db_session.refresh(meeting)
    return meeting


# ── POST /upload ─────────────────────────────────────────────────────────

def test_upload_meeting_requires_auth(db_session):
    response = client.post("/upload", files={"file": ("call.mp3", io.BytesIO(b"fake-audio"), "audio/mpeg")})
    assert response.status_code == 401


def test_upload_meeting_records_the_uploader_as_host(db_session, monkeypatch):
    monkeypatch.setattr(meetings_module, "run_meeting_pipeline_direct", lambda meeting_id: None)
    emp = _make_employee(db_session, name="Uploader Umi")

    response = client.post(
        "/upload",
        files={"file": ("call.mp3", io.BytesIO(b"fake-audio"), "audio/mpeg")},
        headers={"X-User-Name": emp.name},
    )

    assert response.status_code == 202
    meeting_id = response.json()["meeting_id"]
    meeting = db_session.query(Meeting).filter_by(id=meeting_id).first()
    assert meeting.host_name == "Uploader Umi"


# ── GET /task/{id}/status ───────────────────────────────────────────────

def test_task_status_requires_auth(db_session):
    meeting = _make_meeting(db_session)
    response = client.get(f"/task/{meeting.id}/status")
    assert response.status_code == 401


def test_task_status_reachable_when_authenticated(db_session):
    emp = _make_employee(db_session)
    meeting = _make_meeting(db_session)
    response = client.get(f"/task/{meeting.id}/status", headers={"X-User-Name": emp.name})
    assert response.status_code == 200


# ── GET /meeting/{id}/transcript ────────────────────────────────────────

def test_get_transcript_requires_auth(db_session):
    meeting = _make_meeting(db_session)
    response = client.get(f"/meeting/{meeting.id}/transcript")
    assert response.status_code == 401


def test_get_transcript_forbidden_for_non_participant(db_session, monkeypatch):
    outsider = _make_employee(db_session, name="Outside Olly", is_management=False)
    meeting = _make_meeting(db_session)
    monkeypatch.setattr(meetings_module.storage, "get_transcript", lambda mid: {"transcript": []})

    response = client.get(f"/meeting/{meeting.id}/transcript", headers={"X-User-Name": outsider.name})
    assert response.status_code == 403


def test_get_transcript_allowed_for_management(db_session, monkeypatch):
    manager = _make_employee(db_session, name="Casey Manager", is_management=True)
    meeting = _make_meeting(db_session)
    monkeypatch.setattr(meetings_module.storage, "get_transcript", lambda mid: {"transcript": []})

    response = client.get(f"/meeting/{meeting.id}/transcript", headers={"X-User-Name": manager.name})
    assert response.status_code == 200


# ── GET /meeting/{id}/summary ───────────────────────────────────────────

def test_get_summary_requires_auth(db_session):
    meeting = _make_meeting(db_session)
    response = client.get(f"/meeting/{meeting.id}/summary")
    assert response.status_code == 401


# ── GET /meeting/{id}/export ────────────────────────────────────────────

def test_export_requires_auth(db_session):
    meeting = _make_meeting(db_session)
    response = client.get(f"/meeting/{meeting.id}/export")
    assert response.status_code == 401


# ── DELETE /meeting/{id} ────────────────────────────────────────────────

def test_delete_meeting_requires_auth(db_session):
    meeting = _make_meeting(db_session)
    response = client.delete(f"/meeting/{meeting.id}")
    assert response.status_code == 401


def test_delete_meeting_forbidden_for_non_host(db_session):
    outsider = _make_employee(db_session, name="Outside Olly", is_management=False)
    meeting = _make_meeting(db_session, host_name="Casey Manager")

    response = client.delete(f"/meeting/{meeting.id}", headers={"X-User-Name": outsider.name})

    assert response.status_code == 403
    assert db_session.query(Meeting).filter_by(id=meeting.id).first() is not None


def test_delete_meeting_allowed_for_host(db_session):
    host = _make_employee(db_session, name="Hosting Hana", is_management=False)
    meeting = _make_meeting(db_session, host_name=host.name)

    response = client.delete(f"/meeting/{meeting.id}", headers={"X-User-Name": host.name})

    assert response.status_code == 200
    assert db_session.query(Meeting).filter_by(id=meeting.id).first() is None


def test_delete_nonexistent_meeting_still_requires_auth(db_session):
    response = client.delete("/meeting/does-not-exist")
    assert response.status_code == 401


# ── PATCH /graph/node-label ─────────────────────────────────────────────

def test_set_node_label_requires_auth(db_session, monkeypatch):
    monkeypatch.setattr(graph_module.graph_builder, "set_display_name", lambda *a, **k: None)
    monkeypatch.setattr(graph_module.graph_builder, "meetings_referencing_person", lambda *a, **k: [])

    response = client.patch(
        "/graph/node-label",
        json={"node_type": "Person", "identifier": "Old Name", "display_name": "New Name"},
    )
    assert response.status_code == 401


def test_set_node_label_reachable_when_authenticated(db_session, monkeypatch):
    emp = _make_employee(db_session)
    monkeypatch.setattr(graph_module.graph_builder, "set_display_name", lambda *a, **k: None)
    monkeypatch.setattr(graph_module.graph_builder, "meetings_referencing_person", lambda *a, **k: [])

    response = client.patch(
        "/graph/node-label",
        json={"node_type": "Person", "identifier": "Old Name", "display_name": "New Name"},
        headers={"X-User-Name": emp.name},
    )
    assert response.status_code == 200


# ── GET /meeting/{id}/graph-data ────────────────────────────────────────

def test_meeting_graph_data_requires_auth(db_session):
    meeting = _make_meeting(db_session)
    response = client.get(f"/meeting/{meeting.id}/graph-data")
    assert response.status_code == 401


def test_meeting_graph_data_allowed_for_management(db_session):
    manager = _make_employee(db_session, name="Casey Manager", is_management=True)
    meeting = _make_meeting(db_session)
    response = client.get(f"/meeting/{meeting.id}/graph-data", headers={"X-User-Name": manager.name})
    assert response.status_code == 200
