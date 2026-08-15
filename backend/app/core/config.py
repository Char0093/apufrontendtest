from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    gemini_api_key: str
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
