import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.instructor import get_conversation
from backend.api.deps import get_current_student
from backend.api.sessions import get_debrief_agent, get_preflight_agent, get_technical_agent
from backend.database import SessionLocal
from backend.models import Flight, Student

router = APIRouter(prefix="/student", tags=["student"])


class ChatMessage(BaseModel):
    message: str


class DebriefMessage(BaseModel):
    message: str
    flight_id: int | None = None


@router.post("/preflight")
def preflight(body: ChatMessage, student: Student = Depends(get_current_student)):
    agent = get_preflight_agent(student.student_id)
    return {"response": agent.chat(body.message)}


@router.post("/technical")
def technical(body: ChatMessage, student: Student = Depends(get_current_student)):
    agent = get_technical_agent(student.student_id)
    return {"response": agent.chat(body.message)}


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
    return {"response": agent.chat(body.message)}


@router.get("/flights")
def my_flights(student: Student = Depends(get_current_student)):
    session = SessionLocal()
    try:
        rows = session.query(Flight).filter_by(student_id=student.id).all()
        return [
            {
                "flight_id": f.flight_id, "date": f.date.isoformat(), "departure_airport": f.departure_airport,
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
