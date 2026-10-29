"""Pre-flight API v2 — SSE streaming + structured JSON, both never-null.

Routes:
  POST /student/preflight          structured briefing (keeps legacy {response, notice} keys
                                   plus new sections/status/generation_id)
  POST /student/preflight/stream   Server-Sent Events progressive briefing
  POST /student/preflight/cancel   cancel a running generation
  POST /student/preflight/suggest-route   (moved from student.py; no legacy agent)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.gemini_chat import GeminiChat
from agents.preflight_agent import create_flight, save_preflight_package
from backend.access import require_student_access
from backend.api.deps import get_current_student
from backend.api.ratelimit import rate_limit
from backend.config import RATE_LIMIT_AI_REQUESTS, RATE_LIMIT_AI_WINDOW
from backend.models import Flight, Student
from backend.database import SessionLocal
from backend.preflight.contracts import BriefingRequest
from backend.preflight.orchestrator import (
    build_result_text,
    request_cancel,
    run_briefing_json,
    stream_briefing,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/student", tags=["student"])

_ai_limit = rate_limit(RATE_LIMIT_AI_REQUESTS, RATE_LIMIT_AI_WINDOW)

# Successful explicit saves, keyed by briefing generation id (idempotency for
# repeat clicks / retries of the same save — never create a duplicate Flight).
_SAVED_FLIGHTS_BY_GENERATION: dict[str, int] = {}


class CancelBody(BaseModel):
    generation_id: str


class FollowUpBody(BaseModel):
    message: str
    generation_id: str | None = None
    flight_context: dict | None = None


class PreflightSaveBody(BaseModel):
    """Explicit save request: a generated briefing the student chose to save."""

    generation_id: str
    briefing: BriefingRequest


_FOLLOWUP_SYSTEM = """You are PilotMate's pre-flight assistant answering a student's
follow-up question about a briefing they just received. Rules:
- Answer the question directly and concisely.
- When flight context is provided with the question (departure, destination,
  aircraft, exercises, fuel, endurance, etc.), use it to answer questions about
  that flight plan. It reflects what the student entered for the briefing.
- The context contains only the flight plan details the student typed — NOT the
  live data (weather, NOTAMs, runway info) fetched for the briefing. If the
  question needs those fetched facts, say you don't have them in this reply and
  suggest regenerating the briefing or checking official sources.
- Never invent weather, frequencies, runway data, distances, or regulations.
- Mass & balance: a `mass_balance_summary` (when present) is the output of the
  app's deterministic calculator. Quote its numbers exactly as given. NEVER
  recompute, adjust, or invent mass & balance figures, arms, moments, limits,
  or densities — if the student asks for numbers beyond the summary, tell them
  to use the calculation panel in the pre-flight form.
- Always remind the student that reference data must be verified before flight."""

_FOLLOWUP_CONTEXT_KEYS = (
    "departure", "destination", "route", "aircraft_type", "aircraft_registration",
    "exercise", "rules", "flight_date", "departure_time", "flight_period",
    "authority", "runway", "fuel", "endurance", "mass_balance_summary",
)


def _flight_context_blurb(ctx: dict | None) -> str:
    """Compact, non-injectable rendering of the student's flight plan for the
    follow-up prompt. Only known keys are included; values are truncated."""
    if not ctx:
        return ""
    parts = []
    for key in _FOLLOWUP_CONTEXT_KEYS:
        value = ctx.get(key)
        if value is None or value == "":
            continue
        limit = 400 if key == "mass_balance_summary" else 120
        parts.append(f"{key}: {str(value)[:limit]}")
    return "\n".join(parts)


def _persist_student_flight(student: Student, body: BriefingRequest) -> Flight:
    """Persist an explicitly saved pre-flight briefing as a durable Flight (+ PreflightPackage)
    owned by the authenticated student.

    Saving is a deliberate student action (POST /student/preflight/save). Generation itself
    never persists; the flight plan (and the deterministic mass & balance / plan context) is
    stored here so the saved flight is retrievable via GET /student/flights for the Dashboard
    and the Debriefing flight selector.
    """
    details = {
        "departure_airport": body.departure,
        "destination_airport": body.destination,
        "route": body.route,
        "aircraft_type": body.aircraft_type,
        "exercise_type": body.exercise,
        "runway_surface": body.departure_runway_surface,
        "controlled": body.departure_controlled,
        "flight_rules": body.rules,
    }
    flight_date: datetime | None = None
    if body.flight_date:
        try:
            flight_date = datetime.fromisoformat(body.flight_date)
        except ValueError:
            flight_date = None
    flight = create_flight(student.student_id, details, date=flight_date)
    package = {
        "mass_and_balance": body.mass_balance,
        "flight_plan": {
            "route": body.route,
            "flight_rules": body.rules,
            "exercises": [e for e in (body.exercise or "").split(",") if e.strip()],
            "aircraft_type": body.aircraft_type,
            "aircraft_registration": body.aircraft_registration,
            "departure": body.departure,
            "destination": body.destination,
            "departure_time": body.departure_time,
            "flight_period": body.flight_period,
            "authority": body.authority,
            "runway": body.runway,
            "fuel": body.fuel,
            "endurance": body.endurance,
            "departure_runway_surface": body.departure_runway_surface,
            "departure_controlled": body.departure_controlled,
            "destination_runway_surface": body.destination_runway_surface,
            "destination_controlled": body.destination_controlled,
        },
        "metar_taf": None,
        "notam_summary": None,
        "active_areas": None,
        "charts_links": None,
        "frequencies": None,
        "document_checklist": None,
    }
    save_preflight_package(flight.id, package)
    return flight


def _flight_to_dict(flight: Flight) -> dict:
    return {
        "id": flight.id,
        "flight_id": flight.flight_id,
        "date": flight.date.isoformat() if flight.date else None,
        "departure_airport": flight.departure_airport,
        "destination_airport": flight.destination_airport,
        "route": flight.route,
        "aircraft_type": flight.aircraft_type,
        "exercise_type": flight.exercise_type,
        "flight_rules": flight.flight_rules,
    }


@router.post("/preflight")
async def preflight_v2(body: BriefingRequest, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)):
    """Structured briefing. HTTP 200 always carries a full result object —
    sections may be failed/unavailable (explicit), but the body is never null."""
    logger.info("Preflight v2 request from student %s: %s -> %s",
                student.student_id, body.departure, body.destination)
    try:
        result = await run_briefing_json(body.model_dump())
    except Exception as exc:  # noqa: BLE001
        logger.error("Preflight v2 pipeline failed for %s: %s", student.student_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Pre-flight pipeline error")
    text = build_result_text(result)
    logger.info("Preflight v2 %s status=%s sections=%s chars=%d",
                result.generation_id, result.status.value, result.summary(), len(text))
    # Generation never persists a flight — saving is an explicit student action via
    # POST /student/preflight/save. The generation response therefore carries no flight.
    return {
        "response": text,
        "notice": result.notice,
        "generation_id": result.generation_id,
        "status": result.status.value,
        "counts": result.summary(),
        "sections": [s.model_dump(mode="json") for s in result.sections],
    }


@router.post("/preflight/save")
def preflight_save(body: PreflightSaveBody, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)) -> dict:
    """Explicitly save a generated pre-flight briefing as a durable Flight (+ PreflightPackage).

    Generation itself never persists. Saving is a deliberate student action: the server
    persists the flight plan and the deterministic mass & balance context for the
    authenticated student and returns the real saved flight. Idempotent per generation_id,
    so repeated clicks / retries of the same save never create duplicate Flight rows.
    """
    gen_id = body.generation_id
    existing_id = _SAVED_FLIGHTS_BY_GENERATION.get(gen_id)
    if existing_id is not None:
        session = SessionLocal()
        try:
            flight = session.query(Flight).filter_by(id=existing_id).first()
        finally:
            session.close()
        if flight is not None:
            return {"saved": True, "generation_id": gen_id, "flight": _flight_to_dict(flight)}
        _SAVED_FLIGHTS_BY_GENERATION.pop(gen_id, None)
    try:
        flight = _persist_student_flight(student, body.briefing)
    except Exception as exc:  # noqa: BLE001 — never report success when nothing was persisted
        logger.error("Preflight save persistence failed for %s: %s", student.student_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Failed to save the pre-flight flight")
    _SAVED_FLIGHTS_BY_GENERATION[gen_id] = flight.id
    return {"saved": True, "generation_id": gen_id, "flight": _flight_to_dict(flight)}


@router.post("/preflight/stream")
async def preflight_stream(body: BriefingRequest, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)):
    """SSE stream of progressive section events. Emits generation_started,
    section_started/completed/unavailable/failed, generation_completed/failed.
    Every frame carries generation_id so the client can ignore stale streams."""

    final_event: dict = {}

    async def event_source():
        nonlocal final_event
        try:
            async for frame in stream_briefing(body.model_dump()):
                yield frame
                if frame.startswith("event: generation_completed"):
                    final_event = json.loads(frame.split("data: ", 1)[1].strip())
            # Stream finished: generation never persists a flight; saving is an explicit
            # student action via POST /student/preflight/save.
        except Exception as exc:  # noqa: BLE001 — last-resort SSE error frame
            logger.error("Preflight stream crashed for %s: %s", student.student_id, exc, exc_info=True)
            payload = {"type": "generation_failed", "generation_id": "unknown",
                       "error": f"{type(exc).__name__}: {exc}"}
            yield f"event: generation_failed\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/preflight/cancel")
def preflight_cancel(body: CancelBody, student: Student = Depends(get_current_student)):
    cancelled = request_cancel(body.generation_id)
    return {"cancelled": cancelled, "generation_id": body.generation_id}


@router.post("/preflight/follow-up")
async def preflight_follow_up(body: FollowUpBody, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)):
    """Conversational follow-up about a previous briefing. The client re-sends
    the compact flight context it already holds (form state), so answers stay
    tied to the student's actual flight plan without server-side session state."""
    chat = GeminiChat(system_prompt=_FOLLOWUP_SYSTEM)
    blurb = _flight_context_blurb(body.flight_context)
    prompt = body.message
    if blurb:
        prompt = f"Flight plan context for the briefing the student generated:\n{blurb}\n\nStudent's follow-up question: {body.message}"
    try:
        text = chat.chat(prompt)
    except Exception as exc:  # noqa: BLE001
        logger.error("Preflight follow-up failed for %s: %s", student.student_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Follow-up failed")
    if not text or not text.strip():
        raise HTTPException(status_code=502, detail="Follow-up returned an empty reply.")
    return {"response": text, "notice": chat.last_notice}


_ROUTE_SYSTEM = """You are a flight-planning route advisor for student pilots.
Return STRICT JSON only: {"routes": [{"name": "...", "description": "...", "waypoints": ["..."]}]}
1-3 candidate routes. Plain text fields, no markdown. Label suggestions as
requiring pilot verification."""


@router.post("/preflight/suggest-route")
def suggest_route(body: dict, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)):
    departure = body.get("departure", "")
    destination = body.get("destination") or None
    aircraft_type = body.get("aircraft_type", "Cessna 172")
    exercise = body.get("exercise", "")
    if not departure:
        raise HTTPException(400, "departure is required")
    prompt = (
        f"Suggest 1-3 candidate flight routes from {departure}"
        + (f" to {destination}" if destination else " (local flight)")
        + f" in a {aircraft_type} for exercise: {exercise}. "
        "Return JSON with a 'routes' array, each with 'name', 'description', 'waypoints'."
    )
    chat = GeminiChat(system_prompt=_ROUTE_SYSTEM)
    try:
        response = chat.chat(prompt)
        parsed = json.loads(response)
        if isinstance(parsed, dict) and "routes" in parsed:
            parsed["notice"] = chat.last_notice
            parsed["verification_required"] = True
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("suggest-route provider failed for %s: %s", student.student_id, exc)
    return {
        "routes": [{
            "name": f"{departure}" + (f" - {destination}" if destination else " local"),
            "description": "Direct route suggestion unavailable — plan manually and verify.",
            "waypoints": [departure] + ([destination] if destination else []),
        }],
        "notice": chat.last_notice,
        "verification_required": True,
    }
