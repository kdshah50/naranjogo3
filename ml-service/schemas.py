"""
Pydantic schemas for ML Service API contracts.
These match exactly what Listings Service sends and expects back (arch doc §4.3, §5.1, §5.2).
"""
from pydantic import BaseModel, Field, HttpUrl
from enum import Enum
from typing import Optional


# ── Enums matching arch doc listings schema ───────────────────────────────────

class TianguisCategory(str, Enum):
    ELECTRONICS  = "electronics"
    VEHICLES     = "vehicles"
    FASHION      = "fashion"
    HOME         = "home"
    SERVICES     = "services"
    REAL_ESTATE  = "realestate"
    SPORTS       = "sports"
    OTHER        = "other"


class ItemCondition(str, Enum):
    NEW       = "new"
    LIKE_NEW  = "like_new"
    GOOD      = "good"
    FAIR      = "fair"


# ── Webhook payload from Listings Service (arch doc §4.3) ─────────────────────

class PhotoUploadWebhook(BaseModel):
    """
    Sent by Listings Service after POST /listings/:id/photos succeeds.
    Triggers ML categorization + price suggestion (arch doc §4.3).
    """
    listing_id:    str         = Field(..., description="UUID of the draft listing")
    photo_url:     str         = Field(..., description="Cloudflare CDN URL of primary photo")
    photo_urls:    list[str]   = Field(default_factory=list, description="All photo CDN URLs")
    title_es:      Optional[str] = Field(None, description="Optional seller-provided title hint")
    description_es: Optional[str] = Field(None, description="Optional seller description")
    seller_id:     str         = Field(..., description="UUID of seller — for fraud signals")


# ── ML analysis request (internal / direct call) ─────────────────────────────

class AnalyzeRequest(BaseModel):
    """
    Direct analysis request — used by frontend sell flow and internal tools.
    """
    photo_url:    str                   = Field(..., description="Cloudflare CDN URL or public image URL")
    title_hint:   Optional[str]         = Field(None, description="Optional text hint from seller")
    seller_id:    Optional[str]         = Field(None, description="For fraud scoring")


# ── Price suggestion request (standalone endpoint) ───────────────────────────

class PriceSuggestionRequest(BaseModel):
    """
    Request for XGBoost price suggestion model (arch doc §5.2).
    Can be called without an image — title + category + condition are enough.
    """
    category:     TianguisCategory
    condition:    ItemCondition
    title_es:     str               = Field(..., description="Used for brand NER extraction")
    estado:       Optional[str]     = Field(None, description="MX state — one-hot feature")
    photo_count:  int               = Field(1, ge=1, le=10)


# ── ML analysis response ──────────────────────────────────────────────────────

class PriceRange(BaseModel):
    suggested_mxn:   int   = Field(..., description="Point estimate — median of comparables")
    min_mxn:         int   = Field(..., description="20th percentile")
    max_mxn:         int   = Field(..., description="80th percentile")
    comparables_count: int = Field(..., description="Number of sold listings used")
    fallback_used:   bool  = Field(False, description="True if fewer than MIN_COMPARABLES found")


class CategoryResult(BaseModel):
    category:   TianguisCategory
    confidence: float = Field(..., ge=0.0, le=1.0)
    raw_labels: list[str] = Field(default_factory=list, description="Raw Vision API labels")


class FraudSignals(BaseModel):
    """
    Signals computed during ML analysis — passed to Fraud Service (arch doc §5.3).
    """
    phash:              Optional[str]  = Field(None, description="Perceptual hash for dupe detection")
    is_stock_photo:     bool           = Field(False)
    price_below_floor:  bool           = Field(False, description="Price < 20% of category median")
    review_required:    bool           = Field(False, description="True → send to review queue")


class AnalyzeResponse(BaseModel):
    """
    Full ML analysis result returned to Listings Service.
    Stored as ai_category_confidence + suggested_price_mxn in listings table (arch doc §6.1).
    """
    listing_id:     Optional[str]      = None
    category:       CategoryResult
    price:          PriceRange
    condition:      Optional[ItemCondition] = None
    fraud:          FraudSignals
    processing_ms:  int                = Field(..., description="End-to-end latency — target < 4000ms")
    cached:         bool               = Field(False, description="True if result served from Redis")


class PriceSuggestionResponse(BaseModel):
    price:    PriceRange
    category: TianguisCategory
    condition: ItemCondition
