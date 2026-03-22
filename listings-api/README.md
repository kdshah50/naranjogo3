# Tianguis Listings API

**Listings Service** in the architecture diagram: owns CRUD on the `listings` table.

- **Production DB:** **Supabase (PostgreSQL)** — canonical DDL in `../supabase/migrations/20260321120000_listings_architecture.sql`
- **Local dev:** SQLite (`listings.db`) with the **same column names** as Supabase
- **ML fields** (§6.1): `ai_category`, `suggested_price_mxn`, fraud flags, etc. — usually set via `PATCH /listings/{id}` after the ML webhook returns

See also: `../docs/ARCHITECTURE_DATABASE.md`

## Setup

```bash
cd listings-api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# For Supabase: set DATABASE_URL to your pooler URI
uvicorn main:app --reload --port 8001
```

## Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. **SQL Editor** → paste and run `supabase/migrations/20260321120000_listings_architecture.sql`
3. **Project Settings → Database** → copy the **URI** connection string
4. Set `DATABASE_URL=postgresql+psycopg2://...` in `.env`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/listings` | Create listing |
| `GET` | `/listings` | List (`category`, `status`, `seller_id`, `skip`, `limit`) |
| `GET` | `/listings/{id}` | Get one |
| `POST` | `/listings/{id}/photos` | Append CDN photo URLs (§4.3) |
| `PATCH` | `/listings/{id}` | Partial update (includes ML payload keys) |
| `DELETE` | `/listings/{id}` | Delete |
| `GET` | `/health` | Health |

## Example create (architecture field names)

```bash
curl -s -X POST http://127.0.0.1:8001/listings \
  -H "Content-Type: application/json" \
  -d '{
    "title_es": "iPhone 14",
    "description_es": "Buen estado",
    "price_mxn": 12000,
    "category": "electronics",
    "condition": "good",
    "estado": "CDMX",
    "photo_urls": ["https://example.com/1.jpg"],
    "seller_id": "00000000-0000-4000-8000-000000000001",
    "status": "published"
  }'
```

## ML persistence (after `/ml/webhook/photo` response)

`PATCH /listings/{id}` with e.g. `ai_category`, `ai_category_confidence`, `suggested_price_mxn`, `fraud_review_required`, `ml_processing_ms`, … (see `ListingUpdate` in `schemas.py`).

## Next steps

- Wire `naranjogo.jsx` to this API
- Add JWT / internal secret for mutating routes
- Optionally call `ml-service` from Listings Service after `POST .../photos`
