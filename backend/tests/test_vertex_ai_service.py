import json
from types import SimpleNamespace

from google import genai
from google.oauth2 import service_account

from app.services import gemini_service, vertex_ai_service


def _fake_service_account_info() -> dict:
    return {
        "type": "service_account",
        "project_id": "apu-fintech-hackathon",
        "private_key": "fake-private-key",
        "client_email": "vertex-test@example.iam.gserviceaccount.com",
    }


def test_vertex_client_uses_json_secret_and_configured_location(monkeypatch):
    captured = {}
    fake_credentials = object()

    monkeypatch.setattr(
        vertex_ai_service.settings,
        "gemini_service_account_json",
        json.dumps(_fake_service_account_info()),
    )
    monkeypatch.setattr(vertex_ai_service.settings, "gemini_service_account_file", "")
    monkeypatch.setattr(vertex_ai_service.settings, "gemini_project_id", "")
    monkeypatch.setattr(vertex_ai_service.settings, "gemini_location", "us-central1")
    monkeypatch.setattr(
        service_account.Credentials,
        "from_service_account_info",
        lambda info, scopes: captured.update(info=info, scopes=scopes) or fake_credentials,
    )
    monkeypatch.setattr(
        genai,
        "Client",
        lambda **kwargs: captured.update(client=kwargs) or SimpleNamespace(),
    )

    vertex_ai_service.get_client()

    assert captured["client"]["vertexai"] is True
    assert captured["client"]["project"] == "apu-fintech-hackathon"
    assert captured["client"]["location"] == "us-central1"
    assert captured["client"]["credentials"] is fake_credentials
    assert captured["scopes"] == ["https://www.googleapis.com/auth/cloud-platform"]


def test_vertex_client_supports_local_service_account_file(monkeypatch, tmp_path):
    credential_path = tmp_path / "service-account.json"
    credential_path.write_text(json.dumps(_fake_service_account_info()), encoding="utf-8")

    monkeypatch.setattr(vertex_ai_service.settings, "gemini_service_account_json", "")
    monkeypatch.setattr(
        vertex_ai_service.settings,
        "gemini_service_account_file",
        str(credential_path),
    )

    assert vertex_ai_service.is_configured() is True
    assert vertex_ai_service._service_account_info()["project_id"] == "apu-fintech-hackathon"


def test_meeting_analysis_uses_shared_vertex_client(monkeypatch):
    response = SimpleNamespace(text='{"summary":"Vertex result"}')
    models = SimpleNamespace(generate_content=lambda **kwargs: response)
    client = SimpleNamespace(models=models)

    monkeypatch.setattr(vertex_ai_service, "is_configured", lambda *args: True)
    monkeypatch.setattr(vertex_ai_service, "get_client", lambda *args: client)
    monkeypatch.setattr(vertex_ai_service, "model_name", lambda *args: "gemini-2.5-flash")

    result = gemini_service.run_gemini_analysis("SPEAKER_01: Hello")

    assert result["summary"] == "Vertex result"
