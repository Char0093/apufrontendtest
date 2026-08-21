"""Shared Google Gen AI client for Vertex AI and API-key fallback.

Service-account material is read only from backend environment settings and
is never returned to clients or written to logs.
"""

import json
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()

_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
_REQUIRED_SERVICE_ACCOUNT_FIELDS = {"project_id", "client_email", "private_key"}


def _service_account_info(config=None) -> dict | None:
    config = config or settings
    raw_json = config.gemini_service_account_json.strip()
    if raw_json:
        info = json.loads(raw_json)
    elif config.gemini_service_account_file.strip():
        credential_path = Path(config.gemini_service_account_file).expanduser()
        with credential_path.open("r", encoding="utf-8") as credential_file:
            info = json.load(credential_file)
    else:
        return None

    missing = _REQUIRED_SERVICE_ACCOUNT_FIELDS.difference(info)
    if missing:
        raise ValueError(
            "Gemini service-account credentials are missing required fields: "
            + ", ".join(sorted(missing))
        )
    return info


def is_configured(config=None) -> bool:
    config = config or settings
    return bool(
        config.gemini_service_account_json.strip()
        or config.gemini_service_account_file.strip()
        or config.gemini_api_key.strip()
    )


def get_client(config=None):
    """Create a Vertex AI client, falling back to the Gemini Developer API."""
    from google import genai

    config = config or settings
    info = _service_account_info(config)
    if info:
        from google.oauth2 import service_account
        from google.genai import types

        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=[_CLOUD_PLATFORM_SCOPE],
        )
        project_id = config.gemini_project_id.strip() or info["project_id"]
        return genai.Client(
            vertexai=True,
            project=project_id,
            location=config.gemini_location,
            credentials=credentials,
            http_options=types.HttpOptions(api_version="v1"),
        )

    if config.gemini_api_key.strip():
        return genai.Client(api_key=config.gemini_api_key)

    raise RuntimeError("Vertex AI service-account credentials are not configured")


def model_name(config=None) -> str:
    return (config or settings).gemini_vertex_model
