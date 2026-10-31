import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.instructor import get_conversation, instructor_run_preflight, instructor_send, link_student
from backend.api.deps import get_current_instructor
from backend.api.ratelimit import rate_limit
from backend.config import RATE_LIMIT_AI_REQUESTS, RATE_LIMIT_AI_WINDOW
from backend.database import SessionLocal
from backend.models import Instructor, Student

router = APIRouter(prefix="/instructor", tags=["instructor"])

_ai_limit = rate_limit(RATE_LIMIT_AI_REQUESTS, RATE_LIMIT_AI_WINDOW)


class LinkBody(BaseModel):
    student_id: str  # business ID, e.g. "STU-0001"


class MessageBody(BaseModel):
    student_id: str
    message_text: str


class PreflightBody(BaseModel):
    student_id: str
    message: str


def _student_by_business_id(business_id: str) -> Student:
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(student_id=business_id).first()
        if student is None:
            raise HTTPException(404, f"Student {business_id} not found")
        session.expunge(student)
        return student
    finally:
        session.close()


def _instructor_pk(instructor: Instructor) -> int:
    session = SessionLocal()
    try:
        row = session.query(Instructor).filter_by(instructor_id=instructor.instructor_id).first()
        return row.id
    finally:
        session.close()


@router.get("/me")
def me(instructor: Instructor = Depends(get_current_instructor)) -> dict:
    return {
        "instructor_id": instructor.instructor_id,
        "name": instructor.name,
    }


@router.get("/students")
def linked_students(instructor: Instructor = Depends(get_current_instructor)):
    session = SessionLocal()
    try:
        row = session.query(Instructor).filter_by(instructor_id=instructor.instructor_id).first()
        return [
            {"student_id": s.student_id, "name": s.name, "home_airport": s.home_airport}
            for s in (row.linked_students if row else [])
        ]
    finally:
        session.close()


@router.get("/students/{student_id}")
def student_lookup(student_id: str, instructor: Instructor = Depends(get_current_instructor)) -> dict:
    """Instructor-only lookup by business Student ID for the linking flow: resolve the
    student (and their display name) before the instructor confirms the link.
    Only minimal identity fields are returned - no personal/flight data."""
    student = _student_by_business_id(student_id)
    return {
        "found": True,
        "student_id": student.student_id,
        "name": student.name,
    }


@router.post("/link-student")
def link(body: LinkBody, instructor: Instructor = Depends(get_current_instructor)) -> dict:
    student = _student_by_business_id(body.student_id)
    try:
        return link_student(instructor_id=_instructor_pk(instructor), student_id=student.id)
    except ValueError as exc:
        # 404: unknown student/instructor; 409: student already linked to another instructor.
        raise HTTPException(status_code=409 if "already linked" in str(exc) else 404, detail=str(exc))


@router.post("/messages")
def send(body: MessageBody, instructor: Instructor = Depends(get_current_instructor)):
    student = _student_by_business_id(body.student_id)
    try:
        return instructor_send(_instructor_pk(instructor), student.id, body.message_text)
    except PermissionError as exc:
        raise HTTPException(403, str(exc))


@router.get("/messages/{student_id}")
def read_thread(student_id: str, instructor: Instructor = Depends(get_current_instructor)):
    student = _student_by_business_id(student_id)
    try:
        return {"conversation": get_conversation(student.id, _instructor_pk(instructor))}
    except PermissionError as exc:
        raise HTTPException(403, str(exc))


@router.post("/preflight")
def preflight(body: PreflightBody, instructor: Instructor = Depends(get_current_instructor), _: None = Depends(_ai_limit)):
    student = _student_by_business_id(body.student_id)
    try:
        response_text = instructor_run_preflight(_instructor_pk(instructor), student.id, body.message)
        return {"response": response_text, "notice": None}
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
