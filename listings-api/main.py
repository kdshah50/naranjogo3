"""
Listings CRUD API — FastAPI + SQLModel.

Database: SQLite locally; **Supabase (Postgres)** in production (arch diagram).
Schema matches `supabase/migrations/20260321120000_listings_architecture.sql`.
"""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from config import get_settings
from database import get_session, init_db
from models import Listing
from schemas import ListingCreate, ListingRead, ListingUpdate, PhotosAppend


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


_ML_PATCH_KEYS = frozenset({
    "ai_category",
    "ai_category_confidence",
    "ai_raw_labels",
    "suggested_price_mxn",
    "suggested_price_min_mxn",
    "suggested_price_max_mxn",
    "price_comparables_count",
    "price_fallback_used",
    "fraud_phash",
    "fraud_is_stock_photo",
    "fraud_price_below_floor",
    "fraud_review_required",
    "ml_processing_ms",
    "ml_cached",
})


def _to_read(row: Listing) -> ListingRead:
    return ListingRead(
        id=row.id,
        seller_id=row.seller_id,
        title_es=row.title_es,
        title_en=row.title_en,
        description_es=row.description_es,
        description_en=row.description_en,
        price_mxn=row.price_mxn,
        category=row.category,
        condition=row.condition,
        estado=row.estado,
        negotiable=row.negotiable,
        shipping=row.shipping,
        photo_urls=row.photo_urls(),
        photo_count=row.photo_count,
        status=row.status,
        ai_category=row.ai_category,
        ai_category_confidence=row.ai_category_confidence,
        ai_raw_labels=row.ai_raw_labels(),
        suggested_price_mxn=row.suggested_price_mxn,
        suggested_price_min_mxn=row.suggested_price_min_mxn,
        suggested_price_max_mxn=row.suggested_price_max_mxn,
        price_comparables_count=row.price_comparables_count,
        price_fallback_used=row.price_fallback_used,
        fraud_phash=row.fraud_phash,
        fraud_is_stock_photo=row.fraud_is_stock_photo,
        fraud_price_below_floor=row.fraud_price_below_floor,
        fraud_review_required=row.fraud_review_required,
        ml_processing_ms=row.ml_processing_ms,
        ml_cached=row.ml_cached,
        ml_updated_at=row.ml_updated_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _enum_to_value(v):
    return v.value if hasattr(v, "value") else v


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


settings = get_settings()
app = FastAPI(
    title="Tianguis Listings API",
    description="Listings CRUD — schema aligned with arch §4.3 / §6.1; DB = Supabase (Postgres) in prod",
    version="0.2.0",
    lifespan=lifespan,
)

_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SessionDep = Annotated[Session, Depends(get_session)]


@app.get("/health")
def health():
    return {"status": "ok", "service": "listings-api"}


@app.post("/listings", response_model=ListingRead, status_code=201)
def create_listing(body: ListingCreate, session: SessionDep):
    row = Listing(
        title_es=body.title_es,
        title_en=body.title_en,
        description_es=body.description_es,
        description_en=body.description_en,
        price_mxn=body.price_mxn,
        category=body.category.value,
        condition=body.condition.value,
        estado=body.estado,
        negotiable=body.negotiable,
        shipping=body.shipping,
        seller_id=body.seller_id,
        status=body.status.value,
    )
    row.set_photo_urls(body.photo_urls)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@app.get("/listings", response_model=list[ListingRead])
def list_listings(
    session: SessionDep,
    category: Optional[str] = None,
    status: Optional[str] = None,
    seller_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = select(Listing).order_by(Listing.created_at.desc())
    if category:
        stmt = stmt.where(Listing.category == category)
    if status:
        stmt = stmt.where(Listing.status == status)
    if seller_id:
        stmt = stmt.where(Listing.seller_id == seller_id)
    stmt = stmt.offset(skip).limit(limit)
    rows = session.exec(stmt).all()
    return [_to_read(r) for r in rows]


@app.get("/listings/{listing_id}", response_model=ListingRead)
def get_listing(listing_id: str, session: SessionDep):
    row = session.get(Listing, listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _to_read(row)


@app.post("/listings/{listing_id}/photos", response_model=ListingRead)
def append_photos(listing_id: str, body: PhotosAppend, session: SessionDep):
    """
    Append photo CDN URLs (arch §4.3: Listings Service after upload).
    Listings Service typically then calls ML `/ml/webhook/photo` with the new primary URL.
    """
    row = session.get(Listing, listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    existing = row.photo_urls()
    merged = existing + [u for u in body.photo_urls if u not in existing]
    row.set_photo_urls(merged)
    row.updated_at = _utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@app.patch("/listings/{listing_id}", response_model=ListingRead)
def update_listing(listing_id: str, body: ListingUpdate, session: SessionDep):
    row = session.get(Listing, listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")

    data = body.model_dump(exclude_unset=True)

    if "photo_urls" in data:
        row.set_photo_urls(data.pop("photo_urls") or [])

    if "ai_raw_labels" in data:
        row.set_ai_raw_labels(data.pop("ai_raw_labels") or [])

    for enum_key in ("category", "condition", "status", "ai_category"):
        if enum_key in data and data[enum_key] is not None:
            data[enum_key] = _enum_to_value(data[enum_key])

    if _ML_PATCH_KEYS.intersection(data.keys()):
        row.ml_updated_at = _utcnow()

    # Do not write NULL into NOT NULL columns if client sends explicit null
    for key, value in data.items():
        if value is None and key in ("category", "condition", "status"):
            continue
        setattr(row, key, value)

    row.updated_at = _utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@app.delete("/listings/{listing_id}", status_code=204)
def delete_listing(listing_id: str, session: SessionDep):
    row = session.get(Listing, listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    session.delete(row)
    session.commit()
    return None
