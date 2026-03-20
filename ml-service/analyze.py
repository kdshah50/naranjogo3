"""
ML Service routers — arch doc §4.3, §5.1, §5.2

Endpoints:
  POST /ml/analyze          — full analysis: Vision + price + fraud
  POST /ml/webhook/photo    — called by Listings Service after photo upload
  POST /ml/price            — price suggestion only (no image required)
  POST /ml/analyze/feedback — log seller override for monthly training loop

Performance target: < 4 seconds end-to-end (arch doc §9.2)
"""
import time
import json
from fastapi import APIRouter, Header, HTTPException, Depends
from config import get_settings
from app_logging import logger
from redis_client import get_redis
from schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    PhotoUploadWebhook,
    PriceSuggestionRequest,
    PriceSuggestionResponse,
    CategoryResult,
    TianguisCategory,
    ItemCondition,
)
from vision_service import analyze_image
from price_service import suggest_price
from fraud_service import compute_fraud_signals


router = APIRouter(prefix="/ml", tags=["ml"])


def _verify_internal_secret(x_internal_secret: str = Header(...)) -> None:
    """
    Service-to-service auth — shared secret header.
    Arch doc §10.1: internal calls use a shared secret, not JWT.
    """
    settings = get_settings()
    if x_internal_secret != settings.INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid internal secret")


# ── Redis cache key for ML results ────────────────────────────────────────────
def _cache_key(photo_url: str) -> str:
    # We key on photo URL; Listings Service ensures unique CDN URLs per upload
    import hashlib
    url_hash = hashlib.sha256(photo_url.encode()).hexdigest()[:16]
    return f"ml:result:{url_hash}"


async def _run_full_analysis(
    photo_url: str,
    title_hint: str | None,
    seller_id: str | None,
    listing_id: str | None,
) -> AnalyzeResponse:
    """
    Core ML pipeline:
    1. Check Redis cache (keyed on photo URL)
    2. Google Vision → category + confidence
    3. XGBoost → price suggestion
    4. Fraud signals
    Arch doc target: < 4 seconds end-to-end (§9.2)
    """
    settings = get_settings()
    start_ms = int(time.time() * 1000)

    # ── 1. Redis cache check ──────────────────────────────────────────────────
    redis = await get_redis()
    cache_key = _cache_key(photo_url)

    try:
        cached = await redis.get(cache_key)
        if cached:
            result = AnalyzeResponse(**json.loads(cached))
            result.cached = True
            result.listing_id = listing_id
            logger.info("ml.cache_hit", cache_key=cache_key)
            return result
    except Exception as exc:
        logger.warning("ml.cache_error", error=str(exc))

    # ── 2. Google Vision → category ───────────────────────────────────────────
    category_result = await analyze_image(photo_url)

    # ── 3. XGBoost → price suggestion ─────────────────────────────────────────
    # Use detected category; condition defaults to GOOD until seller specifies
    price_range = await suggest_price(
        category=category_result.category,
        condition=ItemCondition.GOOD,
        title_es=title_hint or "",
    )

    # ── 4. Fraud signals ──────────────────────────────────────────────────────
    fraud = await compute_fraud_signals(
        photo_url=photo_url,
        category=category_result.category,
        price_mxn=price_range.suggested_mxn,
    )

    elapsed_ms = int(time.time() * 1000) - start_ms

    response = AnalyzeResponse(
        listing_id=listing_id,
        category=category_result,
        price=price_range,
        fraud=fraud,
        processing_ms=elapsed_ms,
        cached=False,
    )

    # ── 5. Cache result in Redis (arch doc §6.2) ──────────────────────────────
    try:
        await redis.set(
            cache_key,
            response.model_dump_json(),
            ex=settings.ML_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning("ml.cache_write_error", error=str(exc))

    logger.info(
        "ml.analysis_complete",
        listing_id=listing_id,
        category=category_result.category,
        confidence=category_result.confidence,
        suggested_price=price_range.suggested_mxn,
        review_required=fraud.review_required,
        elapsed_ms=elapsed_ms,
    )

    return response


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/webhook/photo",
    response_model=AnalyzeResponse,
    summary="Listings Service webhook — triggered after photo upload",
    description=(
        "Called by Listings Service after POST /listings/:id/photos. "
        "Runs full ML pipeline and updates listing with ai_category_confidence "
        "and suggested_price_mxn (arch doc §4.3, §5.1, §5.2)."
    ),
)
async def webhook_photo_upload(
    payload: PhotoUploadWebhook,
    _: None = Depends(_verify_internal_secret),
) -> AnalyzeResponse:
    return await _run_full_analysis(
        photo_url=payload.photo_url,
        title_hint=payload.title_es,
        seller_id=payload.seller_id,
        listing_id=payload.listing_id,
    )


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Direct analysis — frontend sell flow",
    description=(
        "Called directly from the sell flow UI. "
        "Same pipeline as the webhook but accepts a public image URL "
        "rather than a Cloudflare CDN URL."
    ),
)
async def analyze(
    payload: AnalyzeRequest,
    _: None = Depends(_verify_internal_secret),
) -> AnalyzeResponse:
    return await _run_full_analysis(
        photo_url=payload.photo_url,
        title_hint=payload.title_hint,
        seller_id=payload.seller_id,
        listing_id=None,
    )


@router.post(
    "/price",
    response_model=PriceSuggestionResponse,
    summary="Price suggestion — no image required",
    description=(
        "Standalone price suggestion using XGBoost model. "
        "Called when the seller edits category or condition after AI pre-fill (arch doc §5.2)."
    ),
)
async def price_suggestion(
    payload: PriceSuggestionRequest,
    _: None = Depends(_verify_internal_secret),
) -> PriceSuggestionResponse:
    price = await suggest_price(
        category=payload.category,
        condition=payload.condition,
        title_es=payload.title_es,
        estado=payload.estado,
        photo_count=payload.photo_count,
    )
    return PriceSuggestionResponse(
        price=price,
        category=payload.category,
        condition=payload.condition,
    )


@router.post(
    "/analyze/feedback",
    status_code=204,
    summary="Log seller override for monthly retraining",
    description=(
        "Arch doc §5.1: 'Seller overrides are logged; used to fine-tune mapping table monthly.' "
        "Writes override to Redis for the training pipeline to consume."
    ),
)
async def log_override(
    listing_id: str,
    corrected_category: TianguisCategory,
    corrected_price_mxn: int | None = None,
    _: None = Depends(_verify_internal_secret),
) -> None:
    try:
        redis = await get_redis()
        await redis.lpush(
            "ml:training:overrides",
            json.dumps({
                "listing_id": listing_id,
                "corrected_category": corrected_category.value,
                "corrected_price_mxn": corrected_price_mxn,
                "ts": int(time.time()),
            }),
        )
        logger.info(
            "ml.override_logged",
            listing_id=listing_id,
            corrected_category=corrected_category,
        )
    except Exception as exc:
        logger.error("ml.override_log_error", error=str(exc))
