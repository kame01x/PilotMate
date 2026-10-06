import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.instructor import get_conversation, instructor_run_preflight, instructor_send, link_student
from backend.api.deps import get_current_instructor
from backend.database import SessionLocal
from backend.models import Instructor, Student

router = APIRouter(prefix="/instructor", tags=["instructor"])


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


@router.post("/link-student")
def link(body: LinkBody, instructor: Instructor = Depends(get_current_instructor)):
    student = _student_by_business_id(body.student_id)
    try:
        return link_student(instructor_id=_instructor_pk(instructor), student_id=student.id)
    except (ValueError,) as exc:
        raise HTTPException(404, str(exc))


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
def preflight(body: PreflightBody, instructor: Instructor = Depends(get_current_instructor)):
    student = _student_by_business_id(body.student_id)
    try:
        return {"response": instructor_run_preflight(_instructor_pk(instructor), student.id, body.message)}
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
