import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from agents.instructor import get_conversation
from backend.access import require_student_access
from backend.api.deps import get_current_student, get_current_user
from backend.api.ratelimit import rate_limit
from backend.api.sessions import get_debrief_agent, get_preflight_agent, get_router_agent, get_technical_agent
from backend.config import RATE_LIMIT_AI_REQUESTS, RATE_LIMIT_AI_WINDOW
from backend.database import SessionLocal
from backend.models import Debrief, Flight, Instructor, Student
from backend.profile_photos import (
    MAX_PROFILE_PHOTO_BYTES,
    profile_photo_exists,
    read_profile_photo,
    save_profile_photo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/student", tags=["student"])

_ai_limit = rate_limit(RATE_LIMIT_AI_REQUESTS, RATE_LIMIT_AI_WINDOW)


def _dashboard_flight(flight: Flight, debriefed: bool) -> dict:
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
        "debriefed": debriefed,
    }


class ChatMessage(BaseModel):
    message: str


class DebriefMessage(BaseModel):
    message: str
    flight_id: int | None = None


# Pre-flight request/endpoints moved to backend/api/preflight_api.py (v2 engine).


@router.post("/chat")
async def chat(body: ChatMessage, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)):
    agent = get_router_agent(student.student_id)
    result = agent.chat(body.message)
    notice = getattr(agent._classifier, "last_notice", None)
    routed = result.get("routed_to")
    if routed in ("pre_flight", "technical", "debrief"):
        try:
            if routed == "pre_flight":
                notice = getattr(get_preflight_agent(student.student_id)._chat, "last_notice", notice)
            elif routed == "technical":
                notice = getattr(get_technical_agent(student.student_id)._chat, "last_notice", notice)
            else:
                notice = getattr(get_debrief_agent(student.student_id)._chat, "last_notice", notice)
        except Exception:
            pass
    result["notice"] = notice
    return result


@router.post("/technical")
async def technical(body: ChatMessage, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)):
    agent = get_technical_agent(student.student_id)
    return {"response": agent.chat(body.message), "notice": getattr(agent._chat, "last_notice", None)}


@router.post("/debrief")
async def debrief(body: DebriefMessage, student: Student = Depends(require_student_access), _: None = Depends(_ai_limit)):
    if body.flight_id is not None:
        session = SessionLocal()
        try:
            flight = session.query(Flight).filter_by(id=body.flight_id, student_id=student.id).first()
            if flight is None:
                raise HTTPException(404, "Flight not found for this student")
        finally:
            session.close()
    try:
        agent = get_debrief_agent(student.student_id, flight_id=body.flight_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {"response": agent.chat(body.message), "notice": getattr(agent._chat, "last_notice", None)}


@router.get("/debriefs/{flight_id}")
def get_debrief(flight_id: int, student: Student = Depends(get_current_student)):
    session = SessionLocal()
    try:
        row = session.query(Debrief).filter_by(flight_id=flight_id, student_id=student.id).first()
        if row is None:
            raise HTTPException(404, "No debrief saved for this flight yet")
        return {
            "id": row.id,
            "flight_id": row.flight_id,
            "instructor_notes": row.instructor_notes,
            "student_reported_feedback": row.student_reported_feedback,
            "identified_weak_points": row.identified_weak_points,
            "coaching_notes": row.coaching_notes,
            "agent_conversation_log": row.agent_conversation_log,
        }
    finally:
        session.close()


@router.get("/flights")
def my_flights(student: Student = Depends(get_current_student)):
    session = SessionLocal()
    try:
        rows = session.query(Flight).filter_by(student_id=student.id).all()
        return [
            {
                "id": f.id, "flight_id": f.flight_id, "date": f.date.isoformat(), "departure_airport": f.departure_airport,
                "destination_airport": f.destination_airport, "aircraft_type": f.aircraft_type,
                "exercise_type": f.exercise_type, "flight_rules": f.flight_rules,
            }
            for f in rows
        ]
    finally:
        session.close()


@router.get("/dashboard-summary")
def dashboard_summary(student: Student = Depends(get_current_student)):
    session = SessionLocal()
    try:
        flights = (
            session.query(Flight)
            .filter_by(student_id=student.id)
            .order_by(Flight.date.desc(), Flight.id.desc())
            .all()
        )
        debriefs = session.query(Debrief).filter_by(student_id=student.id).all()
        linked_instructor = None
        if student.linked_instructor_id is not None:
            row = session.query(Instructor).filter_by(id=student.linked_instructor_id).first()
            if row is not None:
                linked_instructor = {"instructor_id": row.instructor_id, "name": row.name}
    finally:
        session.close()

    debriefed_ids = {row.flight_id for row in debriefs}
    completed = sum(1 for flight in flights if flight.id in debriefed_ids)
    total = len(flights)
    now = datetime.now(timezone.utc)
    this_month = sum(
        1
        for flight in flights
        if flight.date and flight.date.year == now.year and flight.date.month == now.month
    )

    return {
        "student_id": student.student_id,
        "name": student.name,
        "linked_instructor": linked_instructor,
        "flights": {
            "total": total,
            "this_month": this_month,
            "last_flight": _dashboard_flight(flights[0], flights[0].id in debriefed_ids) if flights else None,
        },
        "training": {
            "flights_total": total,
            "debriefs_completed": completed,
            "percent": round((completed / total) * 100) if total else 0,
        },
        "recent_flights": [
            _dashboard_flight(flight, flight.id in debriefed_ids) for flight in flights[:5]
        ],
    }


@router.get("/library")
def library_access(student: Student = Depends(get_current_student)):
    from backend.documents import get_library_reference

    return get_library_reference()


@router.get("/instructor-thread")
def instructor_thread(student: Student = Depends(get_current_student)):
    if student.linked_instructor_id is None:
        return {"status": "no_instructor_linked"}
    try:
        return {"conversation": get_conversation(student.id, student.linked_instructor_id)}
    except PermissionError as exc:
        raise HTTPException(403, str(exc))


@router.get("/me")
def me(student: Student = Depends(require_student_access)) -> dict:
    """Public identity of the authenticated student: their unique Student ID and,
    when an instructor relationship exists, the instructor they are authorized to
    train with. Returns only safe public fields - never passwords or tokens."""
    instructor: dict | None = None
    if student.linked_instructor_id is not None:
        session = SessionLocal()
        try:
            row = session.query(Instructor).filter_by(id=student.linked_instructor_id).first()
            if row is not None:
                instructor = {"instructor_id": row.instructor_id, "name": row.name}
        finally:
            session.close()
    return {
        "student_id": student.student_id,
        "name": student.name,
        "linked_instructor": instructor,
    }


@router.get("/profile")
def profile(student: Student = Depends(get_current_student)) -> dict:
    """Sidebar identity for every authenticated student, including students who
    have not subscribed yet. Only the student's own public identity is returned."""
    return {
        "student_id": student.student_id,
        "name": student.name,
        "has_photo": profile_photo_exists(student.student_id),
    }


@router.get("/profile/photo")
def profile_photo(student: Student = Depends(get_current_student)) -> Response:
    photo = read_profile_photo(student.student_id)
    if photo is None:
        raise HTTPException(404, "No profile photo set")
    data, media_type = photo
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
        },
    )


@router.put("/profile/photo")
async def upload_profile_photo(
    request: Request,
    student: Student = Depends(get_current_student),
) -> dict:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_length = int(content_length)
        except ValueError:
            raise HTTPException(400, "Invalid Content-Length header.")
        if declared_length > MAX_PROFILE_PHOTO_BYTES:
            raise HTTPException(413, "Profile photos must be 2 MB or smaller.")

    data = await request.body()
    media_type = save_profile_photo(
        student.student_id,
        data,
        request.headers.get("content-type"),
    )
    return {
        "ok": True,
        "has_photo": True,
        "media_type": media_type,
        "message": "Profile photo saved.",
    }


@router.get("/aviation-data")
def aviation_data(user=Depends(get_current_user)):
    from backend.aviation_data import AVIATION_AUTHORITIES, AIRCRAFT_TYPES, DOCUMENTATION_CATEGORIES, DOCUMENTATION_APPLICABILITY
    return {
        "authorities": AVIATION_AUTHORITIES,
        "aircraft": AIRCRAFT_TYPES,
        "documentation_categories": DOCUMENTATION_CATEGORIES,
        "documentation_applicability": DOCUMENTATION_APPLICABILITY,
    }
