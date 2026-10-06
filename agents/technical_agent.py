"""Technical Agent — exercise coaching (stall, slow flight, landing, ...) and open-topic
aviation theory. Uses Gemini + Tavily video search. Logs each exchange to TechnicalLog."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.gemini_chat import GeminiChat
from backend.config import TAVILY_API_KEY
from backend.database import SessionLocal
from backend.documents import get_library_reference
from backend.models import Flight, Student, TechnicalLog

PREFERRED_VIDEO_SOURCES = ["boldmethod", "aopa", "pilotinstitute", "eaa", "flightout", "aerowebsite"]


def find_reference_video(topic: str) -> dict:
    if not TAVILY_API_KEY:
        return {"error": "TAVILY_API_KEY not configured.", "notice": "Verify against the student's official syllabus."}
    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=TAVILY_API_KEY)
        results = client.search(query=f"{topic} flight training instructional video", max_results=5)
    except Exception as exc:
        return {"error": str(exc), "notice": "Verify against the student's official syllabus."}
    relevant = []
    for r in results.get("results", []):
        url = (r.get("url") or "").lower()
        title = (r.get("title") or "").lower()
        if any(src in url or src in title for src in PREFERRED_VIDEO_SOURCES) or topic.lower().split()[0] in title:
            relevant.append({"title": r.get("title"), "url": r.get("url")})
    if not relevant:
        return {"error": f"No clearly relevant instructional video found for '{topic}'. Check the official flight-training sources manually."}
    return {"videos": relevant, "notice": "Reference suggestion only — instructor/student picks the final resource."}


def log_technical_exchange(student_id: str, flight_id: int | None, topic: str,
                           exchange_type: str, key_points: list, authority_caveat: str | None = None) -> dict:
    session = SessionLocal()
    try:
        row = TechnicalLog(
            student_id=student_id, flight_id=flight_id, topic=topic,
            exchange_type=exchange_type, key_points=key_points,
            authority_caveat=authority_caveat,
        )
        session.add(row)
        session.commit()
        return {"logged": True, "topic": topic}
    finally:
        session.close()


def _current_flight_id(student_id: str) -> int | None:
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(student_id=student_id).first()
        if student is None:
            raise ValueError(f"Student {student_id} not found")
        flight = (
            session.query(Flight)
            .filter_by(student_id=student.id)
            .order_by(Flight.date.desc())
            .first()
        )
        return flight.id if flight else None
    finally:
        session.close()


def _student_authority(student_id: str) -> tuple[str, int]:
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(student_id=student_id).first()
        if student is None:
            raise ValueError(f"Student {student_id} not found")
        return student.authority or "other", student.id
    finally:
        session.close()


def _build_tool_declarations():
    from google.genai import types

    return [
        types.FunctionDeclaration(
            name="find_reference_video",
            description="Find a real instructional video link for a topic",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={"topic": types.Schema(type=types.Type.STRING)},
                required=["topic"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_library_reference",
            description="Look up a real document in the PilotMate documentation library to cite",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "aircraft_type": types.Schema(type=types.Type.STRING),
                    "document_type": types.Schema(type=types.Type.STRING),
                    "category": types.Schema(type=types.Type.STRING),
                },
            ),
        ),
        types.FunctionDeclaration(
            name="log_technical_exchange",
            description="Log a technical-coaching exchange for later Debrief Agent use",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "topic": types.Schema(type=types.Type.STRING),
                    "exchange_type": types.Schema(type=types.Type.STRING),
                    "key_points": types.Schema(type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)),
                    "authority_caveat": types.Schema(type=types.Type.STRING),
                },
                required=["topic", "exchange_type", "key_points"],
            ),
        ),
    ]


class TechnicalAgent:
    def __init__(self, student_id: str):
        self.student_id = student_id
        self.authority, self._student_pk = _student_authority(student_id)
        self._flight_id = _current_flight_id(student_id)

        impls = {
            "find_reference_video": find_reference_video,
            "get_library_reference": get_library_reference,
            "log_technical_exchange": lambda topic, exchange_type, key_points, authority_caveat=None: log_technical_exchange(
                student_id=self._student_pk, flight_id=self._flight_id, topic=topic,
                exchange_type=exchange_type, key_points=key_points, authority_caveat=authority_caveat,
            ),
        }
        self._chat = GeminiChat(
            self._system_prompt(), _build_tool_declarations(), impls
        )

    def _system_prompt(self) -> str:
        return f"""You are PilotMate's Technical Agent. Student profile authority: {self.authority}.

Modes:
- Exercise mode (stall, slow flight, landing, ...): start with a short theory explanation, then common student errors for that exercise (framed as "things students commonly get wrong", never a diagnosis of this student), then one reference video suggestion (call find_reference_video), and a diagram described as structured steps/stages since you cannot show images in v1 — and cite the matching library entry via get_library_reference.
- Open-topic mode: answer directly and conversationally; ask a clarifying question only if genuinely ambiguous.

Rules:
- Regulation- or procedure-specific answers MUST state which authority they assume (use the student's profile, currently '{self.authority}') and note it may differ under other authorities, plus one line: confirm against the student's actual POH/AIP/syllabus.
- Never present one authority's rule as universal. You teach and suggest; the student/instructor holds final responsibility.
- MUST call get_library_reference(category='aircraft', aircraft_type=<student's aircraft>, document_type='POH') and cite the exact title + file_reference + source from the returned documents list in your response. Do not say "see Part 3" or "not found" without calling the tool.
- Use tools: find_reference_video for videos, get_library_reference for document citations, and log_technical_exchange (exchange_type 'exercise' or 'open_topic', topic, key_points list, authority_caveat when applicable) after each substantive exchange."""

    def start_exercise(self, exercise_type: str) -> str:
        return self._chat.chat(
            f"I'm starting an exercise-type technical session for: {exercise_type}. "
            "Give me the theory, common student errors, a reference video, and a diagram description."
        )

    def chat(self, message: str) -> str:
        return self._chat.chat(message)
