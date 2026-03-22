"""Settings — Supabase (Postgres) is the architecture default; SQLite for local-only dev."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Local: SQLite. Production / arch: Supabase Postgres (Session pooler URI recommended).
    # Example (pooler, IPv4):
    # postgresql+psycopg2://postgres.[project-ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
    DATABASE_URL: str = "sqlite:///./listings.db"

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
