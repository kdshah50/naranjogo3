from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
import os

from app.routers import listings, ml, fraud

app = FastAPI(
    title="Tianguis API",
    description="FastAPI backend — ML inference + listing ops + fraud scoring",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("NEXT_PUBLIC_APP_URL", "https://www.naranjogo.com.mx")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Internal auth guard ────────────────────────────────────────────────────────
INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET", "")

def verify_internal(x_internal_secret: str = Header(...)):
    if INTERNAL_SECRET and x_internal_secret != INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(listings.router, prefix="/listings", dependencies=[Depends(verify_internal)])
app.include_router(ml.router,       prefix="/ml",       dependencies=[Depends(verify_internal)])
app.include_router(fraud.router,    prefix="/fraud",    dependencies=[Depends(verify_internal)])

@app.get("/health")
def health():
    return {"status": "ok", "service": "tianguis-fastapi"}
