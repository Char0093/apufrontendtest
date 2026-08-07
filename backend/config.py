from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    gemini_api_key: str
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str
    whisper_model_size: str = "base"
    redis_url: str = "redis://localhost:6379/0"
    storage_base_path: str = "storage"
    sqlite_url: str = "sqlite:///./corporate_brain.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
