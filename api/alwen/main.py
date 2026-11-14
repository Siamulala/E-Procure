from contextlib import asynccontextmanager
from collections.abc import Awaitable, Callable
import json
import logging
import os
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from alwen.analytics import router as analytics_router
from alwen.auth import router as auth_router
from alwen.controls import router as controls_router
from alwen.contracts import router as contracts_router
from alwen.database import get_db
from alwen.jobs import start_scheduler, stop_scheduler
from alwen.notifications import router as notifications_router
from alwen.invoices import router as invoices_router
from alwen.integrations.qbo.router import router as qbo_router
from alwen.procurement import router as procurement_router
from alwen.reference_data import router as reference_router
from alwen.stock import router as stock_router
from alwen.suppliers import router as suppliers_router


logger = logging.getLogger("alwen.http")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())
logger.propagate = False


@asynccontextmanager
async def lifespan(_: FastAPI):
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(
    title="Alwen Procurement & Inventory API",
    version="0.2.0",
    description="Procurement and inventory API for Alwen Networks Ltd.",
    lifespan=lifespan,
)
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALWEN_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def log_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = uuid4().hex
    started_at = perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        logger.info(json.dumps({
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": status_code,
            "duration_ms": round((perf_counter() - started_at) * 1000, 2),
        }, separators=(",", ":")))


app.include_router(auth_router)
app.include_router(controls_router)
app.include_router(contracts_router)
app.include_router(invoices_router)
app.include_router(notifications_router)
app.include_router(qbo_router)
app.include_router(suppliers_router)
app.include_router(analytics_router)
app.include_router(reference_router)
app.include_router(procurement_router)
app.include_router(stock_router)


@app.get("/health", tags=["system"])
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
