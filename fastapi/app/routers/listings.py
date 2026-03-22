from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os, httpx

router = APIRouter(tags=["Listings"])
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

def supa_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

class WebhookPhotoPayload(BaseModel):
    listing_id: str
    photo_url:  str

@router.post("/webhook/photo")
async def photo_webhook(payload: WebhookPhotoPayload):
    """Called by Next.js after photo upload — triggers ML pipeline."""
    from app.routers.ml import analyze_photo, AnalyzeRequest
    result = await analyze_photo(AnalyzeRequest(
        listing_id=payload.listing_id,
        photo_url=payload.photo_url,
    ))
    return result

@router.get("/{listing_id}")
async def get_listing(listing_id: str):
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/listings?id=eq.{listing_id}&select=*",
            headers=supa_headers(),
        )
    if resp.status_code != 200 or not resp.json():
        raise HTTPException(status_code=404, detail="Listing not found")
    return resp.json()[0]
