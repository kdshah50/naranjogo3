# ride-ai (Phase 3 skeleton)

Minimal FastAPI service that proxies deterministic booking to Next.js rides APIs.

## Local run

```bash
cd ride-ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export NEXT_PUBLIC_APP_URL=http://localhost:3000
export INTERNAL_API_SECRET=your-local-secret
uvicorn app.main:app --reload --port 8081
```

## Endpoints

- `GET /health` — readiness
- `POST /booking/process` — requires `x-internal-secret`; body matches `/api/rides/request`

LangGraph + Meta WhatsApp webhook will live here in a later phase. For tomorrow's test, use `/viaje` and Twilio inbound on Next.js directly.
