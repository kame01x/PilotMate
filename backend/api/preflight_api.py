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

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.gemini_chat import GeminiChat
from backend.api.deps import get_current_student
from backend.models import Student
from backend.preflight.contracts import BriefingRequest
from backend.preflight.orchestrator import (
    build_result_text,
    request_cancel,
    run_briefing_json,
    stream_briefing,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/student", tags=["student"])


class CancelBody(BaseModel):
    generation_id: str


class FollowUpBody(BaseModel):
    message: str
    generation_id: str | None = None
    flight_context: dict | None = None


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


@router.post("/preflight")
async def preflight_v2(body: BriefingRequest, student: Student = Depends(get_current_student)):
    """Structured briefing. HTTP 200 always carries a full result object —
    sections may be failed/unavailable (explicit), but the body is never null."""
    logger.info("Preflight v2 request from student %s: %s -> %s",
                student.student_id, body.departure, body.destination)
    try:
        result = await run_briefing_json(body.model_dump())
    except Exception as exc:  # noqa: BLE001 — pipeline failure => explicit 502, never 200-null
        logger.error("Preflight v2 pipeline failed for %s: %s", student.student_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Pre-flight pipeline error: {exc}")
    text = build_result_text(result)
    logger.info("Preflight v2 %s status=%s sections=%s chars=%d",
                result.generation_id, result.status.value, result.summary(), len(text))
    return {
        "response": text,
        "notice": result.notice,
        "generation_id": result.generation_id,
        "status": result.status.value,
        "counts": result.summary(),
        "sections": [s.model_dump(mode="json") for s in result.sections],
    }


@router.post("/preflight/stream")
async def preflight_stream(body: BriefingRequest, student: Student = Depends(get_current_student)):
    """SSE stream of progressive section events. Emits generation_started,
    section_started/completed/unavailable/failed, generation_completed/failed.
    Every frame carries generation_id so the client can ignore stale streams."""

    async def event_source():
        try:
            async for frame in stream_briefing(body.model_dump()):
                yield frame
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
def preflight_follow_up(body: FollowUpBody, student: Student = Depends(get_current_student)):
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
        raise HTTPException(status_code=502, detail=f"Follow-up failed: {exc}")
    if not text or not text.strip():
        raise HTTPException(status_code=502, detail="Follow-up returned an empty reply.")
    return {"response": text, "notice": chat.last_notice}


_ROUTE_SYSTEM = """You are a flight-planning route advisor for student pilots.
Return STRICT JSON only: {"routes": [{"name": "...", "description": "...", "waypoints": ["..."]}]}
1-3 candidate routes. Plain text fields, no markdown. Label suggestions as
requiring pilot verification."""


@router.post("/preflight/suggest-route")
def suggest_route(body: dict, student: Student = Depends(get_current_student)):
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
