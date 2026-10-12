import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.instructor import get_conversation
from backend.api.deps import get_current_student, get_current_user
from backend.api.sessions import get_debrief_agent, get_preflight_agent, get_router_agent, get_technical_agent
from backend.database import SessionLocal
from backend.models import Debrief, Flight, Student

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/student", tags=["student"])


class ChatMessage(BaseModel):
    message: str


class DebriefMessage(BaseModel):
    message: str
    flight_id: int | None = None


# Pre-flight request/endpoints moved to backend/api/preflight_api.py (v2 engine).


@router.post("/chat")
def chat(body: ChatMessage, student: Student = Depends(get_current_student)):
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
def technical(body: ChatMessage, student: Student = Depends(get_current_student)):
    agent = get_technical_agent(student.student_id)
    return {"response": agent.chat(body.message), "notice": getattr(agent._chat, "last_notice", None)}


@router.post("/debrief")
def debrief(body: DebriefMessage, student: Student = Depends(get_current_student)):
    if body.flight_id is not None:
        session = SessionLocal()
        try:
            flight = session.query(Flight).filter_by(id=body.flight_id, student_id=student.id).first()
            if flight is None:
                raise HTTPException(404, "Flight not found for this student")
        finally:
            session.close()
    agent = get_debrief_agent(student.student_id, flight_id=body.flight_id)
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


@router.get("/aviation-data")
def aviation_data(user=Depends(get_current_user)):
    from backend.aviation_data import AVIATION_AUTHORITIES, AIRCRAFT_TYPES, DOCUMENTATION_CATEGORIES, DOCUMENTATION_APPLICABILITY
    return {
        "authorities": AVIATION_AUTHORITIES,
        "aircraft": AIRCRAFT_TYPES,
        "documentation_categories": DOCUMENTATION_CATEGORIES,
        "documentation_applicability": DOCUMENTATION_APPLICABILITY,
    }
