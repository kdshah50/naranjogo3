"""
NaranjoGo Ride AI — FastAPI skeleton (Phase 3).
Deterministic booking stub; LangGraph + LLM wired in a later iteration.

Deploy on Railway like ml-service. Calls Next.js rides APIs with X-Internal-Secret.
"""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

APP_URL = (os.getenv("NEXT_PUBLIC_APP_URL") or os.getenv("RIDES_API_BASE_URL") or "").rstrip("/")
INTERNAL_SECRET = (os.getenv("INTERNAL_API_SECRET") or "").strip()

app = FastAPI(
    title="NaranjoGo Ride AI",
    description="Booking agent orchestrator — calls Next.js deterministic rides APIs.",
    version="0.1.0",
)


def verify_secret(x_internal_secret: str | None) -> None:
    if not INTERNAL_SECRET:
        raise HTTPException(status_code=503, detail="INTERNAL_API_SECRET not configured")
    if x_internal_secret != INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


class BookingProcessRequest(BaseModel):
    buyer_id: str
    pickup_colonia: str
    dropoff_colonia: str
    pickup_address: str | None = None
    dropoff_address: str | None = None
    passengers: int = Field(default=1, ge=1, le=8)
    auto_match: bool = True


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ride-ai", "nextjs": APP_URL or "(unset)"}


@app.post("/booking/process")
async def booking_process(
    body: BookingProcessRequest,
    x_internal_secret: str | None = Header(None, alias="x-internal-secret"),
) -> dict[str, Any]:
    """Deterministic path: estimate → request → (optional) match via Next.js."""
    verify_secret(x_internal_secret)
    if not APP_URL:
        raise HTTPException(status_code=503, detail="NEXT_PUBLIC_APP_URL not configured")

    headers = {"Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET}
    payload = body.model_dump()

    async with httpx.AsyncClient(timeout=30.0) as client:
        est = await client.post(f"{APP_URL}/api/rides/pricing/estimate", json=payload, headers=headers)
        if est.status_code >= 400:
            raise HTTPException(status_code=est.status_code, detail=est.text)

        req = await client.post(f"{APP_URL}/api/rides/request", json=payload, headers=headers)
        if req.status_code >= 400:
            raise HTTPException(status_code=req.status_code, detail=req.text)

    return {"estimate": est.json(), "booking": req.json()}
