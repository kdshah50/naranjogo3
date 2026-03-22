"""
Listings table — columns aligned with arch doc §4.3, §5.2, §6.1 and Supabase migration.

Same model is used for SQLite (local) and PostgreSQL / Supabase (DATABASE_URL).
"""
import json
from datetime import datetime, timezone
from typing import Any, Optional
import uuid

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Listing(SQLModel, table=True):
    __tablename__ = "listings"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)

    seller_id: Optional[str] = Field(default=None, index=True, max_length=64)

    # Seller-facing copy (webhook §4.3: title_es, description_es)
    title_es: str = Field(index=True, max_length=500)
    title_en: Optional[str] = Field(default=None, max_length=500)
    description_es: str = Field(default="", max_length=10_000)
    description_en: Optional[str] = Field(default=None, max_length=10_000)

    # Core listing attributes (training CSV §5.2)
    price_mxn: int = Field(ge=0)
    category: str = Field(default="other", index=True, max_length=64)
    condition: str = Field(default="good", max_length=32)
    estado: str = Field(default="CDMX", max_length=128)

    negotiable: bool = Field(default=False)
    shipping: bool = Field(default=False)

    photo_urls_json: str = Field(default="[]", max_length=100_000)
    photo_count: int = Field(default=0, ge=0, le=50)

    status: str = Field(default="draft", index=True, max_length=32)

    # ── Persisted ML output (§6.1) ───────────────────────────────────────────
    ai_category: Optional[str] = Field(default=None, max_length=64)
    ai_category_confidence: Optional[float] = Field(default=None)
    ai_raw_labels_json: str = Field(default="[]", max_length=20_000)

    suggested_price_mxn: Optional[int] = Field(default=None, ge=0)
    suggested_price_min_mxn: Optional[int] = Field(default=None, ge=0)
    suggested_price_max_mxn: Optional[int] = Field(default=None, ge=0)
    price_comparables_count: Optional[int] = Field(default=None, ge=0)
    price_fallback_used: Optional[bool] = Field(default=None)

    fraud_phash: Optional[str] = Field(default=None, max_length=128)
    fraud_is_stock_photo: bool = Field(default=False)
    fraud_price_below_floor: bool = Field(default=False)
    fraud_review_required: bool = Field(default=False)

    ml_processing_ms: Optional[int] = Field(default=None, ge=0)
    ml_cached: Optional[bool] = Field(default=None)
    ml_updated_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    def photo_urls(self) -> list[str]:
        try:
            data: Any = json.loads(self.photo_urls_json or "[]")
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_photo_urls(self, urls: list[str]) -> None:
        self.photo_urls_json = json.dumps(urls)
        self.photo_count = len(urls)

    def ai_raw_labels(self) -> list[str]:
        try:
            data: Any = json.loads(self.ai_raw_labels_json or "[]")
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_ai_raw_labels(self, labels: list[str]) -> None:
        self.ai_raw_labels_json = json.dumps(labels)
