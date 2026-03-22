from fastapi import APIRouter
from pydantic import BaseModel
import os, httpx

router = APIRouter(tags=["Fraud"])
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

@router.post("/score/{listing_id}")
async def score_listing(listing_id: str):
    """Run fraud signals on a new listing."""
    signals = []
    score   = 0.0

    # Fetch listing from Supabase
    if SUPABASE_URL and SUPABASE_KEY:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/listings?id=eq.{listing_id}&select=price_mxn,category_id,photo_urls",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            if resp.status_code == 200 and resp.json():
                listing = resp.json()[0]
                price   = listing.get("price_mxn", 0)

                # Signal: price below 20% of category median
                MEDIANS = {"electronics": 1500000, "vehicles": 25000000, "fashion": 80000}
                median  = MEDIANS.get(listing.get("category_id", ""), 200000)
                if price < median * 0.20:
                    signals.append("price_below_floor")
                    score += 0.6

                # Signal: no photos
                if not listing.get("photo_urls"):
                    signals.append("no_photos")
                    score += 0.2

    # Flag listing if score too high
    if score >= 0.6 and SUPABASE_URL and SUPABASE_KEY:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/listings?id=eq.{listing_id}",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json={"status": "flagged"}
            )
            # Write fraud signal record
            await client.post(
                f"{SUPABASE_URL}/rest/v1/fraud_signals",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                },
                json={"entity_type": "listing", "entity_id": listing_id,
                      "signal": signals[0] if signals else "anomaly", "score": score}
            )

    return {"listing_id": listing_id, "score": score, "signals": signals, "flagged": score >= 0.6}

cat > /home/claude/nextapp/fastapi/app/__init__.py << 'EOF'
