# Tianguis ML Service

Python FastAPI microservice providing AI/ML capabilities for the Tianguis marketplace.
Deployed on Railway as a persistent container — **arch doc §9.1**.

---

## What this service does

| Capability | Implementation | Arch doc ref |
|---|---|---|
| Image auto-categorization | Google Vision API → label mapping | §5.1 |
| Price suggestion | XGBoost regression model | §5.2 |
| Fraud signals | pHash + price floor checks | §5.3 |
| Result caching | Redis (Upstash) keyed on photo URL hash | §6.2 |
| Training data collection | Seller overrides queued in Redis | §5.1 |

---

## Service topology

```
Listings Service  ──POST /ml/webhook/photo──►  ML Service
                                                  │
                                          ┌───────┴────────┐
                                    Google Vision      Redis cache
                                          │                 │
                                    Label mapping      Cache hit?
                                          │
                                    XGBoost model
                                    (price suggestion)
                                          │
                                    Fraud signals
                                          │
                                    AnalyzeResponse
                                          │
                  ◄─────────────────────────────────────────
```

---

## Local development

### Prerequisites
- Python 3.11+
- Redis running locally (`docker run -p 6379:6379 redis:7-alpine`)
- (Optional) Google Vision API key for real categorization

### Setup

```bash
cd tianguis-ml

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env — add GOOGLE_VISION_API_KEY if you have one
# Without it, categorization returns stub results (safe for dev)

uvicorn app.main:app --reload
```

Service runs at **http://localhost:8000**
Interactive docs at **http://localhost:8000/docs**

---

## API endpoints

### `POST /ml/webhook/photo`
Called automatically by the Listings Service after every photo upload.
Requires `x-internal-secret` header.

```json
{
  "listing_id": "uuid",
  "photo_url": "https://imagedelivery.net/...",
  "photo_urls": ["..."],
  "title_es": "iPhone 14 Pro",
  "seller_id": "uuid"
}
```

### `POST /ml/analyze`
Direct analysis — called from the sell flow UI.

```json
{
  "photo_url": "https://imagedelivery.net/...",
  "title_hint": "iPhone 14 Pro"
}
```

### `POST /ml/price`
Price suggestion without an image — called when seller changes category/condition.

```json
{
  "category": "electronics",
  "condition": "like_new",
  "title_es": "iPhone 14 Pro Max 256GB",
  "estado": "CDMX",
  "photo_count": 5
}
```

### `POST /ml/analyze/feedback`
Log a seller's category or price override for monthly model retraining.

### `GET /health`
Railway readiness probe.

### `GET /metrics`
Prometheus metrics endpoint.

---

## Training the price model

The XGBoost model needs a CSV export of sold listings from Supabase.

```bash
# Export from Supabase:
# SELECT category, condition, title_es, estado, photo_count, price_mxn
# FROM listings WHERE status = 'sold' AND created_at > now() - interval '6 months'

python scripts/train_price_model.py \
  --data data/sold_listings.csv \
  --output app/models/price_model.joblib
```

**Until the model is trained**, the service uses `CATEGORY_MEDIANS_MXN` fallback prices
with condition multipliers. `fallback_used: true` is set in the response so the
frontend can show a less-confident UI.

---

## Running tests

```bash
pytest tests/ -v
```

---

## Deployment — Railway

1. Push this directory to a GitHub repo (or Railway monorepo subdirectory)
2. Create a new Railway service pointing to this directory
3. Set environment variables in the Railway Variables tab (see `.env.example`)
4. Railway auto-builds from `Dockerfile` and deploys
5. The `/health` endpoint is used as the readiness probe

**Required Railway variables:**
- `GOOGLE_VISION_API_KEY`
- `REDIS_URL` (copy from Upstash dashboard)
- `INTERNAL_API_SECRET` (shared with Listings Service)
- `ENV=production`

---

## Performance targets (arch doc §9.2)

| Metric | Target | Notes |
|---|---|---|
| Image upload + ML categorization | < 4 seconds | End-to-end including Vision API |
| Cache hit response | < 50ms | Redis lookup only |
| Price suggestion (no image) | < 200ms | XGBoost inference only |

---

## Phase roadmap alignment

| Phase | What gets added |
|---|---|
| Phase 3 (now) | Google Vision + XGBoost stub + fraud pHash |
| Phase 3 (after training data) | Trained XGBoost model replaces category medians |
| Phase 4 | Quantile regression for tighter price ranges; custom Vision fine-tune |
