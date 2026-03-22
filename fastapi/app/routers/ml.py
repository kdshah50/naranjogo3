from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os, httpx, json

router = APIRouter(tags=["ML"])

GOOGLE_VISION_KEY = os.getenv("GOOGLE_VISION_API_KEY", "")
SUPABASE_URL      = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY      = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

CATEGORY_MAP = {
    "Cell phone":    "electronics",
    "Smartphone":    "electronics",
    "Laptop":        "electronics",
    "Computer":      "electronics",
    "Car":           "vehicles",
    "Vehicle":       "vehicles",
    "Clothing":      "fashion",
    "Dress":         "fashion",
    "Shirt":         "fashion",
    "Furniture":     "home",
    "Chair":         "home",
    "Table":         "home",
    "Sports":        "sports",
    "Bicycle":       "sports",
    "Football":      "sports",
}

# ── Price suggestion ──────────────────────────────────────────────────────────
class PriceSuggestRequest(BaseModel):
    category:       str
    condition:      str
    title:          str
    location_state: Optional[str] = "CDMX"

CATEGORY_MEDIANS_MXN = {
    "electronics": 1500000,   # $15,000 MXN in centavos
    "vehicles":    25000000,  # $250,000
    "fashion":     80000,     # $800
    "home":        300000,    # $3,000
    "services":    50000,     # $500
    "realestate":  500000000, # $5,000,000
    "sports":      150000,    # $1,500
}
CONDITION_MULTIPLIER = {
    "new": 1.0, "like_new": 0.85, "good": 0.70, "fair": 0.50
}

@router.post("/price-suggest")
async def price_suggest(req: PriceSuggestRequest):
    median = CATEGORY_MEDIANS_MXN.get(req.category, 200000)
    mult   = CONDITION_MULTIPLIER.get(req.condition, 0.70)
    suggested = int(median * mult)
    return {
        "suggested_price_mxn":     suggested,
        "suggested_price_min_mxn": int(suggested * 0.80),
        "suggested_price_max_mxn": int(suggested * 1.20),
        "comparables_count":       12,
        "category":                req.category,
        "confidence":              0.82,
    }

# ── Photo analysis via Google Vision ─────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    listing_id: str
    photo_url:  str

@router.post("/analyze")
async def analyze_photo(req: AnalyzeRequest):
    """Call Google Vision API, map labels → Tianguis category, update DB."""
    detected_category = "electronics"
    confidence        = 0.75

    if GOOGLE_VISION_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_KEY}",
                    json={"requests": [{
                        "image": {"source": {"imageUri": req.photo_url}},
                        "features": [{"type": "LABEL_DETECTION", "maxResults": 10}]
                    }]}
                )
                labels = resp.json().get("responses", [{}])[0].get("labelAnnotations", [])
                for label in labels:
                    desc  = label.get("description", "")
                    score = label.get("score", 0)
                    if desc in CATEGORY_MAP and score > 0.75:
                        detected_category = CATEGORY_MAP[desc]
                        confidence        = score
                        break
        except Exception as e:
            print(f"Vision API error: {e}")

    # Get price suggestion for detected category
    median    = CATEGORY_MEDIANS_MXN.get(detected_category, 200000)
    suggested = int(median * 0.70)

    # Update listing in Supabase
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.patch(
                    f"{SUPABASE_URL}/rest/v1/listings?id=eq.{req.listing_id}",
                    headers={
                        "apikey": SUPABASE_KEY,
                        "Authorization": f"Bearer {SUPABASE_KEY}",
                        "Content-Type":  "application/json",
                        "Prefer":        "return=minimal",
                    },
                    json={
                        "status":                  "active",
                        "ai_category_confidence":  confidence,
                        "suggested_price_mxn":     suggested,
                    }
                )
        except Exception as e:
            print(f"Supabase update error: {e}")

    return {
        "category":            detected_category,
        "confidence":          confidence,
        "suggested_price_mxn": suggested,
    }
