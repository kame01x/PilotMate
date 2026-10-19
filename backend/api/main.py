import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.admin import router as admin_router
from backend.api.aircraft import router as aircraft_router
from backend.api.auth import router as auth_router
from backend.api.billing import router as billing_router, webhook_router
from backend.api.instructor import router as instructor_router
from backend.api.preflight_api import router as preflight_router
from backend.api.reference import router as reference_router
from backend.api.student import router as student_router

logger = logging.getLogger(__name__)

app = FastAPI(title="PilotMate API", version="0.1.0")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else []
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(aircraft_router)
app.include_router(preflight_router)
app.include_router(student_router)
app.include_router(instructor_router)
app.include_router(reference_router)
app.include_router(billing_router)
app.include_router(webhook_router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/health")
def health():
    return {"status": "ok"}
