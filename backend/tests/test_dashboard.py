from app.services import dashboard_service
from fastapi.testclient import TestClient
from app.main import app


def test_dashboard_returns_assigned_work_flags_and_recent_meetings(monkeypatch):
    def fake_run_query(cypher: str, **params):
        if "ActionItem" in cypher:
            return [{"task": "Review contract", "deadline": "2026-08-22", "priority": "high"}]
        if "CONTRADICTS" in cypher:
            return [{"message": "Conflicts with the vendor freeze", "meeting_id": "m-1"}]
        return [{"id": "m-1", "title": "Vendor Review"}]

    monkeypatch.setattr(dashboard_service, "run_query", fake_run_query)

    result = dashboard_service.get_dashboard("Sarah Park")

    assert result == {
        "user_id": "Sarah Park",
        "action_items": [{"task": "Review contract", "deadline": "2026-08-22", "priority": "high"}],
        "flags": [{"message": "Conflicts with the vendor freeze", "meeting_id": "m-1"}],
        "upcoming_meetings": [{"id": "m-1", "title": "Vendor Review"}],
    }


def test_dashboard_route_exposes_service_contract(monkeypatch):
    monkeypatch.setattr(
        dashboard_service,
        "get_dashboard",
        lambda user_id: {
            "user_id": user_id,
            "action_items": [],
            "flags": [],
            "upcoming_meetings": [],
        },
    )

    response = TestClient(app).get("/users/Sarah%20Park/dashboard")

    assert response.status_code == 200
    assert response.json()["user_id"] == "Sarah Park"
