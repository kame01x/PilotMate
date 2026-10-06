"""Main Router Agent: free-form student chat -> intent classification -> specialist
hand-off. Uses the shared GeminiChat client (same model, same Ollama fallback).
Routing decisions are surfaced in the returned metadata, never hidden."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.gemini_chat import GeminiChat

INTENT_LABELS = ("pre_flight", "technical", "debrief", "library", "exam_prep", "unclear")

CLASSIFY_PROMPT = """You are the PilotMate router. Classify the student's message intent.

Allowed intents:
- pre_flight: weather, NOTAM, flight planning, mass & balance, pre-flight checklist, a specific upcoming flight's prep
- technical: theory, maneuvers (stall, slow flight, landing), aerodynamics, regulations, how something works
- debrief: reflecting on a flight that already happened, what went well/poorly, coaching after the fact
- library: asking where to find documents, POH, checklists, charts, AIP references
- exam_prep: PPL/ATPL/Know Your Aircraft exam preparation
- unclear: does not fit one of the above, or genuinely matches more than one

Reply with EXACTLY two lines and nothing else:
INTENT: <one label from the list>
CONFIDENCE: high|low

Use CONFIDENCE: low whenever two or more intents are plausible (e.g. "what should I expect for my stall exercise tomorrow" fits both technical and pre_flight). Do not guess."""


def _parse_classification(text: str) -> tuple[str, str]:
    intent = "unclear"
    confidence = "low"
    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith("intent:"):
            cand = line.split(":", 1)[1].strip().lower().replace("-", "_").replace(" ", "_")
            if cand in INTENT_LABELS:
                intent = cand
        elif line.lower().startswith("confidence:"):
            conf = line.split(":", 1)[1].strip().lower()
            confidence = "high" if conf.startswith("high") else "low"
    return intent, confidence


class RouterAgent:
    def __init__(self, student_id: str):
        self.student_id = student_id
        self._classifier = GeminiChat(CLASSIFY_PROMPT)

    def classify(self, message: str) -> tuple[str, str]:
        raw = self._classifier.chat(message)
        return _parse_classification(raw)

    def chat(self, message: str) -> dict:
        intent, confidence = self.classify(message)
        if intent == "unclear" or confidence == "low":
            clarification = (
                "I want to make sure I route you to the right place. Is this about:\n"
                "- pre-flight planning for a specific upcoming flight, or\n"
                "- a technical/theory question about the maneuver itself, or\n"
                "- a debrief of a flight you already flew, or\n"
                "- the document library, or\n"
                "- exam preparation?\n"
                "Tell me which one and I'll take it from there."
            )
            return {"intent": intent, "confidence": confidence, "routed_to": "clarify", "response": clarification}

        if intent == "library":
            from backend.documents import list_general_reference

            docs = list_general_reference()
            summary = "Here are the general reference sections in the library:\n" + "\n".join(
                f"- {d['title']} ({d['document_type']}) — {d['source']}" for d in docs
            )
            return {"intent": intent, "confidence": confidence, "routed_to": "library", "response": summary}

        if intent == "exam_prep":
            from backend.exam_prep import list_sections

            return {
                "intent": intent,
                "confidence": confidence,
                "routed_to": "exam_prep",
                "response": "Exam prep sections available: " + ", ".join(list_sections()) + ". All are currently marked as under construction.",
            }

        # Specialist agents: reuse the same session instances the direct endpoints use
        from backend.api.sessions import get_debrief_agent, get_preflight_agent, get_technical_agent

        try:
            if intent == "pre_flight":
                agent = get_preflight_agent(self.student_id)
                response = agent.chat(message)
            elif intent == "technical":
                agent = get_technical_agent(self.student_id)
                response = agent.chat(message)
            else:  # debrief
                agent = get_debrief_agent(self.student_id)
                response = agent.chat(message)
        except ValueError as exc:
            return {
                "intent": intent,
                "confidence": confidence,
                "routed_to": "clarify",
                "response": f"I couldn't route that yet: {exc}. The debrief agent needs an existing flight — you can start one via the direct pre-flight endpoint first.",
            }
        return {"intent": intent, "confidence": confidence, "routed_to": intent, "response": response}
