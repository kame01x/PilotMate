import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from agents.debrief_agent import DebriefAgent
from agents.preflight_agent import PreflightAgent
from agents.router_agent import RouterAgent
from agents.technical_agent import TechnicalAgent

# In-memory session store: one live agent instance per (student, kind) so each
# authenticated user's conversation state (GeminiChat history) persists across
# requests. v1 local dev only — replace with a proper session table for prod.
_sessions: dict[tuple[str, str], object] = {}


def get_preflight_agent(student_id: str) -> PreflightAgent:
    return _sessions.setdefault(("preflight", student_id), PreflightAgent(student_id))


def get_technical_agent(student_id: str) -> TechnicalAgent:
    return _sessions.setdefault(("technical", student_id), TechnicalAgent(student_id))


def get_debrief_agent(student_id: str, flight_id: int | None = None) -> DebriefAgent:
    key = ("debrief", student_id)
    if key not in _sessions:
        _sessions[key] = DebriefAgent(student_id, flight_id=flight_id)
    return _sessions[key]


def get_router_agent(student_id: str) -> RouterAgent:
    return _sessions.setdefault(("router", student_id), RouterAgent(student_id))
