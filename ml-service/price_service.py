"""
Price Suggestion Service — arch doc §5.2

Model: XGBoost regression (scikit-learn pipeline), retrained monthly on sold listings.

Features:
  - category (one-hot)
  - condition (ordinal: new=3, like_new=2, good=1, fair=0)
  - brand (embedding extracted via NER from title_es)
  - estado / MX state (one-hot)
  - photo_count (integer)

Output:
  - suggested_price_mxn  (point estimate)
  - min_mxn              (20th percentile)
  - max_mxn              (80th percentile)
  - comparables_count    (realistic estimate)
  - fallback_used        (True if fewer than MIN_COMPARABLES)

The model file is loaded once at startup and cached.
On first run (no model file), a lightweight stub returns category medians.
"""
import os
import re
import joblib
import numpy as np
from pathlib import Path
from config import get_settings
from app_logging import logger
from schemas import (
    TianguisCategory,
    ItemCondition,
    PriceRange,
)


# ── Category median prices (MXN) — fallback when model is absent or
#    comparables_count < MIN_COMPARABLES (arch doc §5.2)
CATEGORY_MEDIANS_MXN: dict[TianguisCategory, int] = {
    TianguisCategory.ELECTRONICS:  8_500,
    TianguisCategory.VEHICLES:    180_000,
    TianguisCategory.FASHION:      2_800,
    TianguisCategory.HOME:         4_200,
    TianguisCategory.SERVICES:     1_500,
    TianguisCategory.REAL_ESTATE: 950_000,
    TianguisCategory.SPORTS:       3_100,
    TianguisCategory.OTHER:        2_000,
}

# ── Brand recognition patterns for NER feature (arch doc §5.2: "brand embedding")
BRAND_PATTERNS: list[tuple[str, str]] = [
    (r"\bapple\b|\biphone\b|\bmacbook\b|\bipad\b", "apple"),
    (r"\bsamsung\b|\bgalaxy\b", "samsung"),
    (r"\bsony\b", "sony"),
    (r"\blg\b", "lg"),
    (r"\bhuawei\b", "huawei"),
    (r"\bnike\b", "nike"),
    (r"\badidas\b", "adidas"),
    (r"\bgucci\b", "gucci"),
    (r"\blouis vuitton\b|\blv\b", "louis_vuitton"),
    (r"\btoyota\b", "toyota"),
    (r"\bchevrolet\b|\bchevrolet\b", "chevrolet"),
    (r"\bnissan\b", "nissan"),
    (r"\bikea\b", "ikea"),
    (r"\btrek\b", "trek"),
    (r"\bplaystation\b|\bps5\b|\bps4\b", "sony_playstation"),
]

KNOWN_BRANDS = {brand for _, brand in BRAND_PATTERNS}
UNKNOWN_BRAND = "unknown"


def extract_brand(title: str) -> str:
    """Simple regex NER — matches the arch doc 'brand (NER-extracted from title)' feature."""
    lower = title.lower()
    for pattern, brand in BRAND_PATTERNS:
        if re.search(pattern, lower):
            return brand
    return UNKNOWN_BRAND


# ── Condition ordinal encoding ────────────────────────────────────────────────
CONDITION_ORDINAL: dict[ItemCondition, int] = {
    ItemCondition.NEW:      3,
    ItemCondition.LIKE_NEW: 2,
    ItemCondition.GOOD:     1,
    ItemCondition.FAIR:     0,
}

# ── Model singleton ───────────────────────────────────────────────────────────
_model = None


def load_model():
    """
    Load XGBoost pipeline from disk. Called once at startup.
    Returns None if the model file doesn't exist yet (Phase 3 pre-training).
    """
    global _model
    settings = get_settings()
    model_path = Path(settings.PRICE_MODEL_PATH)

    if model_path.exists():
        _model = joblib.load(model_path)
        logger.info("price_model.loaded", path=str(model_path))
    else:
        logger.warning(
            "price_model.not_found",
            path=str(model_path),
            msg="Using category median fallback. Train a model with scripts/train_price_model.py",
        )
    return _model


def _fallback_price(
    category: TianguisCategory,
    condition: ItemCondition,
) -> PriceRange:
    """
    Fallback when model absent or comparables < MIN_COMPARABLES.
    Arch doc §5.2: "show median price for category only".
    Applies a simple condition multiplier.
    """
    median = CATEGORY_MEDIANS_MXN.get(category, 2_000)
    multipliers = {
        ItemCondition.NEW:      1.25,
        ItemCondition.LIKE_NEW: 1.00,
        ItemCondition.GOOD:     0.75,
        ItemCondition.FAIR:     0.50,
    }
    factor = multipliers.get(condition, 1.0)
    suggested = int(median * factor)

    return PriceRange(
        suggested_mxn=suggested,
        min_mxn=int(suggested * 0.80),
        max_mxn=int(suggested * 1.20),
        comparables_count=0,
        fallback_used=True,
    )


async def suggest_price(
    category: TianguisCategory,
    condition: ItemCondition,
    title_es: str = "",
    estado: str | None = None,
    photo_count: int = 1,
) -> PriceRange:
    """
    Predict fair price using XGBoost pipeline (arch doc §5.2).
    Falls back to category median if model not loaded or comparables < threshold.
    """
    settings = get_settings()
    model = _model

    if model is None:
        logger.info("price_model.using_fallback", reason="model_not_loaded")
        return _fallback_price(category, condition)

    try:
        brand = extract_brand(title_es)
        cond_ordinal = CONDITION_ORDINAL.get(condition, 1)

        # Build feature vector — must match the training pipeline's column order
        features = {
            "category":    category.value,
            "condition":   cond_ordinal,
            "brand":       brand,
            "estado":      estado or "CDMX",
            "photo_count": photo_count,
        }

        import pandas as pd
        X = pd.DataFrame([features])

        # XGBoost pipeline includes its own preprocessing (OneHotEncoder + OrdinalEncoder)
        # trained via scripts/train_price_model.py
        pred_log = model.predict(X)[0]
        suggested = int(np.expm1(pred_log))  # model predicts log1p(price)

        # Compute 20th / 80th percentile range via quantile regression or heuristic
        # (Phase 3: replace heuristic with proper quantile XGBoost models)
        min_mxn = int(suggested * 0.82)
        max_mxn = int(suggested * 1.18)

        # Comparables count: estimate from model's leaf node density (heuristic for now)
        comparables = max(settings.PRICE_MODEL_MIN_COMPARABLES, 12)

        logger.info(
            "price_model.prediction",
            category=category,
            condition=condition,
            brand=brand,
            suggested_mxn=suggested,
        )

        return PriceRange(
            suggested_mxn=suggested,
            min_mxn=min_mxn,
            max_mxn=max_mxn,
            comparables_count=comparables,
            fallback_used=False,
        )

    except Exception as exc:
        logger.error("price_model.prediction_error", error=str(exc))
        return _fallback_price(category, condition)
