"""
Configuration — all secrets via environment variables.
On Railway: set via the Variables tab.
On local dev: create a .env file (never commit it).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ── Service identity ──────────────────────────────────────────────────────
    SERVICE_NAME: str = "tianguis-ml-service"
    ENV: str = "development"  # development | staging | production

    # ── Google Vision API (arch doc §5.1) ─────────────────────────────────────
    # Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json on Railway
    # or pass GOOGLE_VISION_API_KEY for key-based auth
    GOOGLE_VISION_API_KEY: str = ""

    # ── Redis (arch doc §6.2 — ML result cache) ───────────────────────────────
    # Upstash Redis on prod; local Redis on dev
    REDIS_URL: str = "redis://localhost:6379/0"
    ML_CACHE_TTL_SECONDS: int = 3600  # 1 hour — re-use results for same image hash

    # ── JWT verification (arch doc §10.1 — RS256) ─────────────────────────────
    # The Auth Service exposes its public key at /.well-known/jwks.json
    AUTH_SERVICE_JWKS_URL: str = "http://auth-service/.well-known/jwks.json"
    # Internal service-to-service calls skip JWT — use a shared secret instead
    INTERNAL_API_SECRET: str = "change-me-in-production"

    # ── Price model (arch doc §5.2) ───────────────────────────────────────────
    # Path to the serialised XGBoost model file
    # On Railway: mount a volume or bake into the Docker image
    PRICE_MODEL_PATH: str = "app/models/price_model.joblib"
    PRICE_MODEL_MIN_COMPARABLES: int = 5  # fallback to category median if fewer

    # ── Listings Service webhook (arch doc §4.3) ──────────────────────────────
    # ML Service is called by Listings Service after photo upload
    LISTINGS_SERVICE_URL: str = "http://listings-service"

    # ── Fraud thresholds (arch doc §5.3) ─────────────────────────────────────
    # Price < 20% of category median → flag for review
    FRAUD_PRICE_FLOOR_PCT: float = 0.20
    # Cosine similarity > 0.9 vs flagged listings → queue
    FRAUD_DESCRIPTION_SIM_THRESHOLD: float = 0.90

    # ── Vision confidence gate (arch doc §5.1) ───────────────────────────────
    VISION_CONFIDENCE_THRESHOLD: float = 0.75  # below → default to 'other'


@lru_cache
def get_settings() -> Settings:
    return Settings()
