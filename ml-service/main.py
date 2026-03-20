"""
Tianguis ML Service — FastAPI entry point
Deployed on Railway (persistent Python container) — arch doc §9.1
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from config import get_settings
from app_logging import configure_logging, logger
from redis_client import get_redis, close_redis
from price_service import load_model
import analyze


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    configure_logging()
    settings = get_settings()
    logger.info("service.starting", name=settings.SERVICE_NAME, env=settings.ENV)

    # Warm Redis connection
    await get_redis()

    # Load XGBoost price model into memory once (arch doc §5.2)
    load_model()

    logger.info("service.ready")
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await close_redis()
    logger.info("service.stopped")


settings = get_settings()

app = FastAPI(
    title="Tianguis ML Service",
    description=(
        "AI/ML microservice for Tianguis marketplace. "
        "Provides image categorization (Google Vision), "
        "price suggestion (XGBoost), and fraud signals. "
        "Deployed on Railway — arch doc §9.1."
    ),
    version="0.1.0",
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url="/redoc" if settings.ENV != "production" else None,
    lifespan=lifespan,
)

# ── CORS — only internal services call this, but allow * for local dev ────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.ENV == "development" else [
        "https://tianguis.mx",
        "https://api.tianguis.mx",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Prometheus metrics — Railway metrics scraping (arch doc §9.1) ─────────────
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(analyze.router)


# ── Health check — Railway uses this for readiness probe ─────────────────────
@app.get("/health", tags=["ops"])
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME, "env": settings.ENV}


@app.get("/", tags=["ops"])
async def root():
    return {"service": "tianguis-ml-service", "docs": "/docs"}
