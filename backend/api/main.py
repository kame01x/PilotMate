import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.aircraft import router as aircraft_router
from backend.api.auth import router as auth_router
from backend.api.instructor import router as instructor_router
from backend.api.preflight_api import router as preflight_router
from backend.api.reference import router as reference_router
from backend.api.student import router as student_router

app = FastAPI(title="PilotMate API", version="0.1.0")

# Local frontend dev (Next.js). Loopback hosts only, any port, so the app
# works whether the browser opens the frontend as localhost or 127.0.0.1.
# For production, pin the exact origin(s) and set allow_credentials=False
# for public endpoints.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(aircraft_router)
app.include_router(preflight_router)
app.include_router(student_router)
app.include_router(instructor_router)
app.include_router(reference_router)


@app.get("/health")
def health():
    return {"status": "ok"}
