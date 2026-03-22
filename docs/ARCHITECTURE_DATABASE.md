# Database — architecture alignment

The marketplace **system of record** for listings is **PostgreSQL** (recommended: **Supabase**), matching the platform diagram:

- **Listings Service** (this repo: `listings-api`) owns CRUD on the `listings` table.
- **ML Service** returns analysis; the Listings Service **persists** AI/price/fraud fields (arch doc **§6.1**).
- Training exports use the same columns as **§5.2** (`category`, `condition`, `title_es`, `estado`, `photo_count`, `price_mxn`, …).

## References in code

| Area | Arch doc |
|------|-----------|
| Webhook payload shape | **§4.3** (`PhotoUploadWebhook` in `ml-service/schemas.py`) |
| Columns written after ML | **§6.1** (`AnalyzeResponse` → `ai_category_confidence`, `suggested_price_mxn`, …) |
| Supabase export for training | `ml-service/README.md` |

## Canonical DDL

Run the migration in Supabase **SQL Editor** (or `psql`):

`supabase/migrations/20260321120000_listings_architecture.sql`

## Local development

`listings-api` defaults to **SQLite** so you can run without Supabase. Use the **same column names** as the SQL migration so switching `DATABASE_URL` to Supabase is a drop-in config change.

```env
# Supabase: Project Settings → Database → Connection string (URI, psycopg2)
DATABASE_URL=postgresql+psycopg2://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```
