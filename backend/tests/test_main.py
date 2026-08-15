import logging
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


@contextmanager
def capture_request_logs(caplog):
    # app/core/logger.py sets propagate=False on every logger it creates, so
    # caplog's default root-logger capture never sees these records — attach
    # its handler directly to the logger we care about instead.
    request_logger = logging.getLogger("app.request")
    request_logger.addHandler(caplog.handler)
    try:
        with caplog.at_level(logging.INFO, logger="app.request"):
            yield
    finally:
        request_logger.removeHandler(caplog.handler)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_livekit_token_is_signed_without_exposing_secret():
    response = client.post(
        "/livekit/token",
        json={"room_name": "q3-planning", "display_name": "Alex Mercer"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["server_url"] == "ws://localhost:7880"
    assert body["identity"].startswith("Alex-Mercer-")
    assert len(body["token"].split(".")) == 3
    assert "secret" not in body


def test_livekit_token_rejects_unsafe_room_id():
    response = client.post(
        "/livekit/token",
        json={"room_name": "not a valid room", "display_name": "Alex Mercer"},
    )
    assert response.status_code == 422


def test_cors_headers_present_for_allowed_origin():
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_request_logging_records_status_and_path(caplog):
    with capture_request_logs(caplog):
        client.get("/health")
    assert any("GET /health -> 200" in record.message for record in caplog.records)


def test_unhandled_exception_on_real_app_logs_and_returns_clean_500(caplog):
    @app.get("/__test_boom")
    def boom():
        raise ValueError("deliberate test failure")

    try:
        with capture_request_logs(caplog):
            response = client.get("/__test_boom")

        assert response.status_code == 500
        assert response.json() == {"detail": "Internal server error"}
        assert "ValueError" not in response.text
        assert "Traceback" not in response.text
        assert any(
            "GET /__test_boom -> 500" in record.message for record in caplog.records
        )
    finally:
        app.router.routes[:] = [
            r for r in app.router.routes if getattr(r, "path", None) != "/__test_boom"
        ]
