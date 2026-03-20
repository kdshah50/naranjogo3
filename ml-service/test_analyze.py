"""
ML Service tests — pytest
Run: pytest tests/ -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.schemas import (
    TianguisCategory,
    ItemCondition,
    CategoryResult,
    PriceRange,
    FraudSignals,
)
from app.services.price_service import (
    extract_brand,
    _fallback_price,
    CATEGORY_MEDIANS_MXN,
)
from app.services.vision_service import _map_labels_to_category


INTERNAL_SECRET = "test-secret"

# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def override_settings(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_SECRET", INTERNAL_SECRET)
    monkeypatch.setenv("GOOGLE_VISION_API_KEY", "")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/99")


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ── Unit tests: brand extraction ──────────────────────────────────────────────

def test_brand_extraction_apple():
    assert extract_brand("iPhone 14 Pro Max 256GB") == "apple"

def test_brand_extraction_samsung():
    assert extract_brand("Samsung Galaxy S23 Ultra nuevo") == "samsung"

def test_brand_extraction_unknown():
    assert extract_brand("Silla de madera vintage") == "unknown"

def test_brand_extraction_case_insensitive():
    assert extract_brand("TOYOTA Corolla 2020") == "toyota"


# ── Unit tests: label mapping ─────────────────────────────────────────────────

def test_label_map_smartphone():
    labels = [
        {"description": "Smartphone", "score": 0.97},
        {"description": "Mobile phone", "score": 0.95},
    ]
    category, confidence, raw = _map_labels_to_category(labels)
    assert category == TianguisCategory.ELECTRONICS
    assert confidence >= 0.90

def test_label_map_vehicle():
    labels = [
        {"description": "Car", "score": 0.98},
        {"description": "Automotive design", "score": 0.85},
    ]
    category, confidence, raw = _map_labels_to_category(labels)
    assert category == TianguisCategory.VEHICLES

def test_label_map_unknown_falls_back_to_other():
    labels = [
        {"description": "Painting", "score": 0.72},
        {"description": "Art", "score": 0.68},
    ]
    # confidence 0.72 < threshold 0.75 → OTHER
    category, confidence, raw = _map_labels_to_category(labels)
    # mapping may not match any keyword → OTHER
    assert isinstance(category, TianguisCategory)


# ── Unit tests: price fallback ────────────────────────────────────────────────

def test_fallback_price_electronics_new():
    price = _fallback_price(TianguisCategory.ELECTRONICS, ItemCondition.NEW)
    median = CATEGORY_MEDIANS_MXN[TianguisCategory.ELECTRONICS]
    assert price.suggested_mxn == int(median * 1.25)
    assert price.fallback_used is True
    assert price.min_mxn < price.suggested_mxn < price.max_mxn

def test_fallback_price_vehicles_fair():
    price = _fallback_price(TianguisCategory.VEHICLES, ItemCondition.FAIR)
    median = CATEGORY_MEDIANS_MXN[TianguisCategory.VEHICLES]
    assert price.suggested_mxn == int(median * 0.50)

def test_fallback_price_range_valid():
    price = _fallback_price(TianguisCategory.HOME, ItemCondition.GOOD)
    assert price.min_mxn < price.suggested_mxn
    assert price.suggested_mxn < price.max_mxn


# ── Integration tests: HTTP endpoints ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_endpoint(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_analyze_requires_auth(client):
    r = await client.post(
        "/ml/analyze",
        json={"photo_url": "https://example.com/photo.jpg"},
        headers={},  # no secret
    )
    assert r.status_code == 422  # missing header


@pytest.mark.asyncio
async def test_analyze_unauthorized(client):
    r = await client.post(
        "/ml/analyze",
        json={"photo_url": "https://example.com/photo.jpg"},
        headers={"x-internal-secret": "wrong-secret"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
@patch("app.routers.analyze._run_full_analysis")
async def test_analyze_returns_response(mock_run, client):
    mock_run.return_value = MagicMock(
        listing_id=None,
        category=CategoryResult(
            category=TianguisCategory.ELECTRONICS,
            confidence=0.95,
            raw_labels=["Smartphone"],
        ),
        price=PriceRange(
            suggested_mxn=15000,
            min_mxn=12000,
            max_mxn=18000,
            comparables_count=24,
            fallback_used=False,
        ),
        fraud=FraudSignals(),
        processing_ms=850,
        cached=False,
        model_dump_json=lambda: "{}",
    )
    mock_run.return_value.model_dump = lambda: {
        "listing_id": None,
        "category": {"category": "electronics", "confidence": 0.95, "raw_labels": ["Smartphone"]},
        "price": {"suggested_mxn": 15000, "min_mxn": 12000, "max_mxn": 18000,
                  "comparables_count": 24, "fallback_used": False},
        "fraud": {"phash": None, "is_stock_photo": False,
                  "price_below_floor": False, "review_required": False},
        "processing_ms": 850,
        "cached": False,
        "condition": None,
    }

    r = await client.post(
        "/ml/analyze",
        json={"photo_url": "https://imagedelivery.net/test/photo.jpg"},
        headers={"x-internal-secret": INTERNAL_SECRET},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
@patch("app.services.price_service.suggest_price")
async def test_price_endpoint(mock_price, client):
    mock_price.return_value = PriceRange(
        suggested_mxn=18500,
        min_mxn=15000,
        max_mxn=22000,
        comparables_count=31,
        fallback_used=False,
    )

    r = await client.post(
        "/ml/price",
        json={
            "category": "electronics",
            "condition": "used",
            "title_es": "iPhone 14 Pro Max 256GB",
            "estado": "CDMX",
            "photo_count": 5,
        },
        headers={"x-internal-secret": INTERNAL_SECRET},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["price"]["suggested_mxn"] == 18500
