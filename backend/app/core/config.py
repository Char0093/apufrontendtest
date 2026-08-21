from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    # Vertex AI mode (used instead of gemini_api_key when set): a GCP
    # service-account key authenticates the same google-genai SDK against
    # Vertex AI rather than the Gemini Developer API — no API key, billed to
    # the GCP project instead of a per-key quota. Credentials come from
    # either google_application_credentials (a file path) or
    # gemini_service_account_json (the JSON document inline — what Hugging
    # Face Spaces secrets need, since there's no way to mount a file there).
    gemini_project_id: str = ""
    gemini_location: str = "us-central1"
    gemini_vertex_model: str = "gemini-2.5-flash"
    google_application_credentials: str = ""
    gemini_service_account_json: str = ""
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_username: str = "neo4j"
    neo4j_password: str
    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "sqlite:///./corporate_brain.db"
    storage_path: str = "storage"
    # These defaults match `livekit-server --dev` only.  Use distinct values
    # in every non-development environment.
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"
    app_jwt_secret: str = "dev-app-jwt-secret-change-me-32-bytes-minimum"
    app_jwt_issuer: str = "corporate-brain"
    app_jwt_exp_minutes: int = 480
    google_oauth_client_id: str = ""

    # ASR + LLM intelligence pipeline (Phase 2-4)
    deepgram_api_key: str = ""
    agnes_api_key: str = ""
    agnes_base_url: str = "https://apihub.agnes-ai.com/v1"
    groq_api_key: str = ""
    demo_mode: bool = True
    chroma_path: str = "storage/chroma"


@lru_cache
def get_settings() -> Settings:
    return Settings()
