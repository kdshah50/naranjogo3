"""
Google Vision Service — arch doc §5.1

Flow:
  1. Photo URL received from Listings Service webhook
  2. Vision labelDetection + objectLocalization called on primary photo
  3. Custom label mapping: Vision labels → Tianguis category IDs
  4. Confidence gate: if < 0.75 → default to 'other', ask user
  5. Seller overrides logged for monthly fine-tuning
"""
import httpx
from config import get_settings
from app_logging import logger
from schemas import TianguisCategory, CategoryResult


# ── Label mapping table (arch doc §5.1: "Custom mapping table: Vision labels → Tianguis category IDs")
# Key: lowercase Vision label substring → Tianguis category
# Order matters — more specific matches listed first
LABEL_CATEGORY_MAP: list[tuple[str, TianguisCategory]] = [
    # Electronics
    ("smartphone", TianguisCategory.ELECTRONICS),
    ("mobile phone", TianguisCategory.ELECTRONICS),
    ("laptop", TianguisCategory.ELECTRONICS),
    ("computer", TianguisCategory.ELECTRONICS),
    ("tablet", TianguisCategory.ELECTRONICS),
    ("television", TianguisCategory.ELECTRONICS),
    ("camera", TianguisCategory.ELECTRONICS),
    ("headphones", TianguisCategory.ELECTRONICS),
    ("electronic", TianguisCategory.ELECTRONICS),

    # Vehicles
    ("car", TianguisCategory.VEHICLES),
    ("vehicle", TianguisCategory.VEHICLES),
    ("motorcycle", TianguisCategory.VEHICLES),
    ("truck", TianguisCategory.VEHICLES),
    ("automobile", TianguisCategory.VEHICLES),
    ("van", TianguisCategory.VEHICLES),
    ("bicycle", TianguisCategory.VEHICLES),

    # Fashion
    ("clothing", TianguisCategory.FASHION),
    ("fashion", TianguisCategory.FASHION),
    ("shoe", TianguisCategory.FASHION),
    ("bag", TianguisCategory.FASHION),
    ("handbag", TianguisCategory.FASHION),
    ("watch", TianguisCategory.FASHION),
    ("jacket", TianguisCategory.FASHION),
    ("dress", TianguisCategory.FASHION),
    ("shirt", TianguisCategory.FASHION),

    # Home & Furniture
    ("furniture", TianguisCategory.HOME),
    ("chair", TianguisCategory.HOME),
    ("table", TianguisCategory.HOME),
    ("sofa", TianguisCategory.HOME),
    ("appliance", TianguisCategory.HOME),
    ("kitchen", TianguisCategory.HOME),
    ("lamp", TianguisCategory.HOME),
    ("bed", TianguisCategory.HOME),
    ("shelf", TianguisCategory.HOME),

    # Real Estate
    ("house", TianguisCategory.REAL_ESTATE),
    ("apartment", TianguisCategory.REAL_ESTATE),
    ("building", TianguisCategory.REAL_ESTATE),
    ("property", TianguisCategory.REAL_ESTATE),
    ("room", TianguisCategory.REAL_ESTATE),

    # Sports
    ("sport", TianguisCategory.SPORTS),
    ("ball", TianguisCategory.SPORTS),
    ("gym", TianguisCategory.SPORTS),
    ("fitness", TianguisCategory.SPORTS),
    ("bicycle", TianguisCategory.SPORTS),  # secondary match
    ("surfboard", TianguisCategory.SPORTS),
    ("tennis", TianguisCategory.SPORTS),
    ("football", TianguisCategory.SPORTS),
]


def _map_labels_to_category(
    labels: list[dict],
) -> tuple[TianguisCategory, float, list[str]]:
    """
    Map Vision API labels to a Tianguis category.
    Returns (category, confidence, raw_label_strings).
    Confidence is derived from the Vision score of the matching label.
    """
    raw = [lbl["description"].lower() for lbl in labels]
    scores = {lbl["description"].lower(): lbl["score"] for lbl in labels}

    for keyword, category in LABEL_CATEGORY_MAP:
        for label_text in raw:
            if keyword in label_text:
                confidence = scores.get(label_text, 0.5)
                return category, confidence, [l["description"] for l in labels[:5]]

    return TianguisCategory.OTHER, 0.0, [l["description"] for l in labels[:5]]


async def analyze_image(photo_url: str) -> CategoryResult:
    """
    Call Google Vision API labelDetection + objectLocalization.
    Arch doc §5.1: "Google Vision labelDetection + objectLocalization on primary photo"

    Falls back gracefully if Vision API key is not configured (dev mode).
    """
    settings = get_settings()

    if not settings.GOOGLE_VISION_API_KEY:
        logger.warning(
            "vision.api_key_missing",
            msg="GOOGLE_VISION_API_KEY not set — returning stub result for development",
        )
        return CategoryResult(
            category=TianguisCategory.OTHER,
            confidence=0.0,
            raw_labels=["(Vision API key not configured)"],
        )

    endpoint = (
        f"https://vision.googleapis.com/v1/images:annotate"
        f"?key={settings.GOOGLE_VISION_API_KEY}"
    )

    payload = {
        "requests": [
            {
                "image": {"source": {"imageUri": photo_url}},
                "features": [
                    {"type": "LABEL_DETECTION", "maxResults": 15},
                    {"type": "OBJECT_LOCALIZATION", "maxResults": 10},
                ],
            }
        ]
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(endpoint, json=payload)
        response.raise_for_status()
        data = response.json()

    annotations = data["responses"][0]
    labels = annotations.get("labelAnnotations", [])

    if not labels:
        logger.info("vision.no_labels", photo_url=photo_url)
        return CategoryResult(
            category=TianguisCategory.OTHER,
            confidence=0.0,
            raw_labels=[],
        )

    category, confidence, raw_labels = _map_labels_to_category(labels)

    # Arch doc §5.1: "if confidence < 0.75, default to 'Other' and ask user"
    if confidence < settings.VISION_CONFIDENCE_THRESHOLD:
        logger.info(
            "vision.low_confidence",
            category=category,
            confidence=confidence,
            fallback="other",
        )
        category = TianguisCategory.OTHER

    logger.info(
        "vision.result",
        category=category,
        confidence=round(confidence, 3),
        top_label=raw_labels[0] if raw_labels else None,
    )

    return CategoryResult(
        category=category,
        confidence=round(confidence, 3),
        raw_labels=raw_labels,
    )
