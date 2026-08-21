"""Single place that decides how the app talks to Gemini, so the six call
sites (gemini_service, embedding_service, vision_service,
contradiction_service, askcoco_service x2) don't each duplicate the
api-key-vs-Vertex branch.

Vertex AI mode (a GCP service-account key, billed to the project) is used
whenever gemini_project_id is configured; otherwise this falls back to the
Gemini Developer API key, same as before. Same google-genai SDK either way —
only how the Client authenticates changes."""
import logging
import threading

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client = None
_client_lock = threading.Lock()
_client_init_attempted = False


def gemini_available() -> bool:
    return bool(settings.gemini_project_id or settings.gemini_api_key)


def gemini_model() -> str:
    """The model name every call site should pass to generate_content —
    kept configurable (GEMINI_VERTEX_MODEL) rather than hardcoded per call
    site, so switching models is a single env var change."""
    return settings.gemini_vertex_model


def get_genai_client():
    """Lazily build and cache the one google.genai Client this process
    needs. Returns None if neither Vertex nor an API key is configured —
    callers already handle a missing client as "Gemini unavailable, use the
    fallback provider"."""
    global _client, _client_init_attempted
    if _client is not None:
        return _client
    if _client_init_attempted:
        return None

    with _client_lock:
        if _client is not None or _client_init_attempted:
            return _client
        _client_init_attempted = True
        try:
            from google import genai

            if settings.gemini_project_id:
                credentials = None
                if settings.google_application_credentials:
                    from google.oauth2 import service_account

                    credentials = service_account.Credentials.from_service_account_file(
                        settings.google_application_credentials,
                        scopes=["https://www.googleapis.com/auth/cloud-platform"],
                    )
                elif settings.gemini_service_account_json:
                    # Hugging Face Spaces secrets are env vars, not files —
                    # there's no way to mount a credentials file there, so
                    # this takes the same JSON document inline instead.
                    import json

                    from google.oauth2 import service_account

                    credentials = service_account.Credentials.from_service_account_info(
                        json.loads(settings.gemini_service_account_json),
                        scopes=["https://www.googleapis.com/auth/cloud-platform"],
                    )
                _client = genai.Client(
                    vertexai=True,
                    project=settings.gemini_project_id,
                    location=settings.gemini_location,
                    credentials=credentials,
                )
                logger.info(
                    f"Gemini client initialized via Vertex AI "
                    f"(project={settings.gemini_project_id}, location={settings.gemini_location})"
                )
            elif settings.gemini_api_key:
                _client = genai.Client(api_key=settings.gemini_api_key)
                logger.info("Gemini client initialized via Developer API key")
        except Exception as e:
            logger.warning(f"Gemini client init failed: {e}")
            _client = None

    return _client
