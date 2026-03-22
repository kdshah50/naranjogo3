"""Pydantic schemas — enums match ml-service / arch doc listings schema."""
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class TianguisCategory(str, Enum):
    ELECTRONICS = "electronics"
    VEHICLES = "vehicles"
    FASHION = "fashion"
    HOME = "home"
    SERVICES = "services"
    REAL_ESTATE = "realestate"
    SPORTS = "sports"
    OTHER = "other"


class ItemCondition(str, Enum):
    NEW = "new"
    LIKE_NEW = "like_new"
    GOOD = "good"
    FAIR = "fair"


class ListingStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    SOLD = "sold"
    ARCHIVED = "archived"


class ListingCreate(BaseModel):
    title_es: str = Field(..., min_length=1, max_length=500)
    title_en: Optional[str] = Field(None, max_length=500)
    description_es: str = ""
    description_en: Optional[str] = None
    price_mxn: int = Field(..., ge=0)
    category: TianguisCategory = TianguisCategory.OTHER
    condition: ItemCondition = ItemCondition.GOOD
    estado: str = "CDMX"
    negotiable: bool = False
    shipping: bool = False
    photo_urls: list[str] = Field(default_factory=list)
    seller_id: Optional[str] = None
    status: ListingStatus = ListingStatus.DRAFT


class ListingUpdate(BaseModel):
    """Partial update — includes ML fields for Listings Service after webhook (§6.1)."""

    title_es: Optional[str] = Field(None, min_length=1, max_length=500)
    title_en: Optional[str] = None
    description_es: Optional[str] = None
    description_en: Optional[str] = None
    price_mxn: Optional[int] = Field(None, ge=0)
    category: Optional[TianguisCategory] = None
    condition: Optional[ItemCondition] = None
    estado: Optional[str] = None
    negotiable: Optional[bool] = None
    shipping: Optional[bool] = None
    photo_urls: Optional[list[str]] = None
    seller_id: Optional[str] = None
    status: Optional[ListingStatus] = None

    ai_category: Optional[TianguisCategory] = None
    ai_category_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    ai_raw_labels: Optional[list[str]] = None

    suggested_price_mxn: Optional[int] = Field(None, ge=0)
    suggested_price_min_mxn: Optional[int] = Field(None, ge=0)
    suggested_price_max_mxn: Optional[int] = Field(None, ge=0)
    price_comparables_count: Optional[int] = Field(None, ge=0)
    price_fallback_used: Optional[bool] = None

    fraud_phash: Optional[str] = None
    fraud_is_stock_photo: Optional[bool] = None
    fraud_price_below_floor: Optional[bool] = None
    fraud_review_required: Optional[bool] = None

    ml_processing_ms: Optional[int] = Field(None, ge=0)
    ml_cached: Optional[bool] = None


class ListingRead(BaseModel):
    id: str
    seller_id: Optional[str]

    title_es: str
    title_en: Optional[str]
    description_es: str
    description_en: Optional[str]

    price_mxn: int
    category: str
    condition: str
    estado: str

    negotiable: bool
    shipping: bool
    photo_urls: list[str]
    photo_count: int

    status: str

    ai_category: Optional[str]
    ai_category_confidence: Optional[float]
    ai_raw_labels: list[str]

    suggested_price_mxn: Optional[int]
    suggested_price_min_mxn: Optional[int]
    suggested_price_max_mxn: Optional[int]
    price_comparables_count: Optional[int]
    price_fallback_used: Optional[bool]

    fraud_phash: Optional[str]
    fraud_is_stock_photo: bool
    fraud_price_below_floor: bool
    fraud_review_required: bool

    ml_processing_ms: Optional[int]
    ml_cached: Optional[bool]
    ml_updated_at: Optional[datetime]

    created_at: datetime
    updated_at: datetime


class PhotosAppend(BaseModel):
    """Append CDN URLs after upload — mirrors POST /listings/:id/photos (§4.3)."""

    photo_urls: list[str] = Field(..., min_length=1)
