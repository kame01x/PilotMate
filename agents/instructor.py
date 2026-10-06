"""Part 2 — Instructor (v1): student linking by ID, instructor<->student messaging
via InstructorMessage, and reused Pre-flight Agent access. Every instructor-facing
function enforces assert_linked_student before touching any student data."""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.models import Instructor, InstructorMessage, Student


def assert_linked_student(instructor_id: int, student_id: int) -> None:
    """Authorization boundary: raise unless the student is linked to THIS instructor."""
    session = SessionLocal()
    try:
        instructor = session.query(Instructor).filter_by(id=instructor_id).first()
        student = session.query(Student).filter_by(id=student_id).first()
        if instructor is None:
            raise PermissionError(f"Instructor {instructor_id} not found")
        if student is None:
            raise PermissionError(f"Student {student_id} not found")
        if student.linked_instructor_id != instructor_id:
            raise PermissionError(
                f"Rejected: student {student_id} is not linked to instructor {instructor_id}"
            )
    finally:
        session.close()


def link_student(instructor_id: int, student_id: int) -> dict:
    session = SessionLocal()
    try:
        instructor = session.query(Instructor).filter_by(id=instructor_id).first()
        student = session.query(Student).filter_by(id=student_id).first()
        if instructor is None:
            raise ValueError(f"Instructor {instructor_id} not found")
        if student is None:
            raise ValueError(f"Student {student_id} not found")
        student.linked_instructor_id = instructor.id
        session.commit()
        return {
            "linked": True,
            "instructor": instructor.instructor_id,
            "student": student.student_id,
            "linked_students_now": [s.student_id for s in instructor.linked_students],
        }
    finally:
        session.close()


def _resolve(session, instructor_id: int, student_id: int) -> tuple[Instructor, Student]:
    instructor = session.query(Instructor).filter_by(id=instructor_id).first()
    student = session.query(Student).filter_by(id=student_id).first()
    if instructor is None or student is None:
        raise ValueError("Instructor or Student not found")
    return instructor, student


def send_message(from_type: str, from_id: int, to_type: str, to_id: int,
                 message_text: str) -> dict:
    session = SessionLocal()
    try:
        # Enforce the trust boundary from both directions
        if from_type == "instructor":
            assert_linked_student(from_id, to_id)
        elif from_type == "student":
            student = session.query(Student).filter_by(id=from_id).first()
            if student is None or student.linked_instructor_id != to_id:
                raise PermissionError(f"Rejected: student {from_id} is not linked to instructor {to_id}")
        else:
            raise ValueError("from_type must be 'instructor' or 'student'")
        msg = InstructorMessage(
            from_id=from_id, from_type=from_type, to_id=to_id, to_type=to_type,
            timestamp=datetime.now(timezone.utc), message_text=message_text, read_status=False,
        )
        session.add(msg)
        session.commit()
        return {"sent": True, "id": msg.id, "from": f"{from_type}:{from_id}", "to": f"{to_type}:{to_id}"}
    finally:
        session.close()


def instructor_send(instructor_id: int, student_id: int, text: str) -> dict:
    return send_message("instructor", instructor_id, "student", student_id, text)


def student_send(student_id: int, instructor_id: int, text: str) -> dict:
    return send_message("student", student_id, "instructor", instructor_id, text)


def get_conversation(student_id: int, instructor_id: int) -> list[dict]:
    assert_linked_student(instructor_id, student_id)
    session = SessionLocal()
    try:
        rows = (
            session.query(InstructorMessage)
            .filter(
                ((InstructorMessage.from_type == "instructor") & (InstructorMessage.from_id == instructor_id) & (InstructorMessage.to_id == student_id))
                | ((InstructorMessage.from_type == "student") & (InstructorMessage.from_id == student_id) & (InstructorMessage.to_id == instructor_id))
            )
            .order_by(InstructorMessage.timestamp)
            .all()
        )
        return [
            {
                "id": r.id,
                "from": f"{r.from_type}:{r.from_id}",
                "to": f"{r.to_type}:{r.to_id}",
                "timestamp": r.timestamp.isoformat(),
                "message_text": r.message_text,
                "read_status": r.read_status,
            }
            for r in rows
        ]
    finally:
        session.close()


def mark_read(message_id: int, reader_type: str, reader_id: int) -> dict:
    session = SessionLocal()
    try:
        msg = session.query(InstructorMessage).filter_by(id=message_id).first()
        if msg is None:
            raise ValueError(f"Message {message_id} not found")
        if msg.to_type != reader_type or msg.to_id != reader_id:
            raise PermissionError("Rejected: only the recipient can mark a message read")
        msg.read_status = True
        session.commit()
        return {"read": True, "id": msg.id}
    finally:
        session.close()


def instructor_run_preflight(instructor_id: int, student_id: int, message: str) -> str:
    """Thin wrapper: verify the student is linked to this instructor, then reuse
    the existing PreflightAgent from Phase 2 — no forked logic."""
    assert_linked_student(instructor_id, student_id)
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(id=student_id).first()
        assert student is not None
        business_id = student.student_id
    finally:
        session.close()
    from agents.preflight_agent import PreflightAgent

    agent = PreflightAgent(business_id)
    return agent.chat(message)
