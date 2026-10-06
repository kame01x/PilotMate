"""Debrief Agent — post-flight reflective conversation grounded in the flight's
PreflightPackage and the student's TechnicalLog rows. Produces a Debrief record.
Instructor chat is a v1 stub by design."""

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.gemini_chat import GeminiChat
from backend.database import SessionLocal
from backend.models import Debrief, Flight, PreflightPackage, Student, TechnicalLog


def _group_technical_logs(student_pk: int, flight_id: int | None) -> dict[str, list[str]]:
    session = SessionLocal()
    try:
        q = session.query(TechnicalLog).filter_by(student_id=student_pk)
        if flight_id is not None:
            q = q.filter((TechnicalLog.flight_id == flight_id) | (TechnicalLog.flight_id.is_(None)))
        by_topic: dict[str, list[str]] = defaultdict(list)
        for row in q.order_by(TechnicalLog.created_at).all():
            by_topic[row.topic].extend(row.key_points or [])
        return dict(by_topic)
    finally:
        session.close()


def save_debrief(flight_id: int, student_pk: int, student_reported_feedback: str,
                 agent_conversation_log: list, identified_weak_points: list,
                 coaching_notes: str) -> dict:
    session = SessionLocal()
    try:
        existing = session.query(Debrief).filter_by(flight_id=flight_id).first()
        if existing is not None:
            return {"error": f"Debrief already exists for flight_id={flight_id}"}
        debrief = Debrief(
            flight_id=flight_id,
            student_id=student_pk,
            instructor_notes=None,
            student_reported_feedback=student_reported_feedback,
            agent_conversation_log=agent_conversation_log,
            identified_weak_points={
                "status": "DRAFT — suggested observations pending instructor review. Not a confirmed diagnosis.",
                "items": identified_weak_points,
            },
            coaching_notes=coaching_notes,
        )
        session.add(debrief)
        session.commit()
        return {"saved": True, "flight_id": flight_id}
    finally:
        session.close()


def open_instructor_chat(student_pk: int | None = None) -> dict:
    # Wired (Phase 5) to real InstructorMessage storage via agents/instructor.py:
    # returns the linked instructor's conversation thread for this student.
    # student_pk optional so legacy Phase-4 call sites omitting it keep working.
    if student_pk is None:
        return {"status": "wired", "message": "Instructor thread available via agents.instructor.get_conversation."}
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(id=student_pk).first()
        if student is None:
            return {"error": "student not found"}
        instructor_id = student.linked_instructor_id
    finally:
        session.close()
    if instructor_id is None:
        return {"status": "no_instructor_linked", "message": "No instructor is linked to this student yet."}
    from agents.instructor import get_conversation

    conversation = get_conversation(student_pk, instructor_id)
    return {"status": "wired", "instructor_id": instructor_id, "conversation": conversation}


def _build_tool_declarations():
    from google.genai import types

    return [
        types.FunctionDeclaration(
            name="save_debrief",
            description="Save the final Debrief record at the end of the conversation",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "student_reported_feedback": types.Schema(type=types.Type.STRING),
                    "agent_conversation_log": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(
                            type=types.Type.OBJECT,
                            properties={
                                "question": types.Schema(type=types.Type.STRING),
                                "student_answer_summary": types.Schema(type=types.Type.STRING),
                            },
                        ),
                    ),
                    "identified_weak_points": types.Schema(
                        type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)
                    ),
                    "coaching_notes": types.Schema(type=types.Type.STRING),
                },
                required=["student_reported_feedback", "agent_conversation_log", "identified_weak_points", "coaching_notes"],
            ),
        ),
        types.FunctionDeclaration(
            name="open_instructor_chat",
            description="Open the instructor message thread for this student",
            parameters=types.Schema(type=types.Type.OBJECT, properties={}),
        ),
    ]


class DebriefAgent:
    def __init__(self, student_id: str, flight_id: int | None = None):
        session = SessionLocal()
        try:
            student = session.query(Student).filter_by(student_id=student_id).first()
            if student is None:
                raise ValueError(f"Student {student_id} not found")
            if flight_id is None:
                flight = (
                    session.query(Flight).filter_by(student_id=student.id)
                    .order_by(Flight.date.desc()).first()
                )
            else:
                flight = session.query(Flight).filter_by(id=flight_id, student_id=student.id).first()
            if flight is None:
                raise ValueError("No flight found for this student")
            package = session.query(PreflightPackage).filter_by(flight_id=flight.id).first()
            self._student_pk = student.id
            self._student_name = student.name
            self._authority = student.authority
            self._flight = flight
            self._package = package
        finally:
            session.close()

        self._technical_groups = _group_technical_logs(self._student_pk, self._flight.id)

        impls = {
            "save_debrief": lambda **kw: save_debrief(flight_id=self._flight.id, student_pk=self._student_pk, **kw),
            "open_instructor_chat": lambda: open_instructor_chat(student_pk=self._student_pk),
        }
        self._chat = GeminiChat(self._system_prompt(), _build_tool_declarations(), impls)

    def _flight_summary(self) -> str:
        f = self._flight
        return (
            f"Flight {f.flight_id}: {f.date:%Y-%m-%d}, {f.departure_airport} -> {f.destination_airport or 'local'}, "
            f"route={f.route}, aircraft={f.aircraft_type}, exercise={f.exercise_type}, "
            f"runway={f.runway_surface}, controlled={f.controlled}, rules={f.flight_rules}"
        )

    def _system_prompt(self) -> str:
        tech = "\n".join(
            f"- {topic}: " + "; ".join(dict.fromkeys(points))[:400]
            for topic, points in self._technical_groups.items()
        ) or "- (none logged)"
        package_brief = "available" if self._package else "not recorded"
        return f"""You are PilotMate's Debrief Agent. Student: {self._student_name} (authority: {self._authority}).

Flight context:
{self._flight_summary()}
Preflight package for this flight: {package_brief}.
Technical coaching covered before this flight (grouped by topic):
{tech}

Behavior:
- Have a short, conversational, reflective post-flight conversation. Ask open questions: how the planned exercise went, what felt difficult, what they'd do differently, anything unplanned. Follow up when the student says something worth digging into.
- You may reflect back patterns you notice (e.g. link to what was covered pre-flight), but NEVER deliver a performance verdict or diagnose the student. No clinical or absolute language. The instructor (human) makes authoritative judgments; v1 has no live instructor, so 'identified weak points' are draft suggestions only.
- Do not speculate about psychology; ground coaching notes strictly in what the student actually said.
- When the conversation has covered enough, call save_debrief with: student_reported_feedback (their own summary in their words), agent_conversation_log (structured list of question + student_answer_summary), identified_weak_points (short list, each phrased as a draft suggestion to confirm with the instructor), coaching_notes (constructive, actionable, tied to the discussion).
- If the student opens instructor chat, call open_instructor_chat and share the returned thread summary."""

    def chat(self, message: str) -> str:
        return self._chat.chat(message)
