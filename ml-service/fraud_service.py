"""
Fraud Signal Service — arch doc §5.3

Computes anomaly signals for every new listing and account.
Anomalous items enter a human review queue before going live.

Signals implemented here:
  ✓ Photo pHash (perceptual hash) — for duplicate/stock photo detection
  ✓ Price below floor — price < 20% of category median → flag
  ✓ Stock photo detection — pHash match against known stock photo hashes
  → Phone velocity + device fingerprint signals live in Auth Service (arch doc §5.3)
  → Description plagiarism lives in Listings Service (cosine similarity)
"""
import hashlib
import httpx
from io import BytesIO

try:
    from PIL import Image
    import imagehash
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

from config import get_settings
from app_logging import logger
from redis_client import get_redis
from schemas import FraudSignals, TianguisCategory
from price_service import CATEGORY_MEDIANS_MXN


# Redis key prefix for known stock photo hashes (arch doc §9.3)
STOCK_PHOTO_HASH_KEY = "fraud:stock_photo_hashes"
# Redis key prefix for recently flagged listing pHashes
FLAGGED_HASH_KEY = "fraud:flagged_phashes"


async def _fetch_image_bytes(url: str) -> bytes | None:
    """Download image for pHash computation. Timeout 5s."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.content
    except Exception as exc:
        logger.warning("fraud.image_fetch_failed", url=url, error=str(exc))
        return None


def _compute_phash(image_bytes: bytes) -> str | None:
    """
    Compute perceptual hash (pHash) — arch doc §9.3.
    Used for duplicate + stock photo detection in fraud layer.
    """
    if not PIL_AVAILABLE:
        logger.warning("fraud.pillow_not_available", msg="Install Pillow + imagehash for pHash")
        return None
    try:
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
        return str(imagehash.phash(img))
    except Exception as exc:
        logger.warning("fraud.phash_error", error=str(exc))
        return None


async def _is_stock_photo(phash: str) -> bool:
    """
    Check pHash against known stock photo hash set stored in Redis.
    Arch doc §5.3: "Photo reverse image search — match to stock photo → auto-reject"
    """
    try:
        redis = await get_redis()
        return await redis.sismember(STOCK_PHOTO_HASH_KEY, phash)
    except Exception:
        return False


def _price_below_floor(
    price_mxn: int | None,
    category: TianguisCategory,
) -> bool:
    """
    Arch doc §5.3: "Price < 20% of median triggers review"
    """
    if price_mxn is None:
        return False
    settings = get_settings()
    median = CATEGORY_MEDIANS_MXN.get(category, 2_000)
    floor = int(median * settings.FRAUD_PRICE_FLOOR_PCT)
    return price_mxn < floor


async def compute_fraud_signals(
    photo_url: str,
    category: TianguisCategory,
    price_mxn: int | None = None,
) -> FraudSignals:
    """
    Compute all fraud signals for a new listing.
    Called as part of the full ML analysis pipeline.
    """
    phash: str | None = None
    is_stock = False
    price_flagged = False

    # 1. Download image + compute pHash
    image_bytes = await _fetch_image_bytes(photo_url)
    if image_bytes:
        phash = _compute_phash(image_bytes)
        if phash:
            is_stock = await _is_stock_photo(phash)

    # 2. Price floor check
    price_flagged = _price_below_floor(price_mxn, category)

    # 3. Aggregate review_required decision
    review_required = is_stock or price_flagged

    signals = FraudSignals(
        phash=phash,
        is_stock_photo=is_stock,
        price_below_floor=price_flagged,
        review_required=review_required,
    )

    if review_required:
        logger.warning(
            "fraud.review_required",
            category=category,
            price_mxn=price_mxn,
            is_stock=is_stock,
            price_flagged=price_flagged,
        )

    return signals
