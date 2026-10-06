"""Simulates a full debrief conversation for the student's most recent flight,
reading its real PreflightPackage and TechnicalLog rows, and prints the saved Debrief."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.debrief_agent import DebriefAgent, open_instructor_chat

SCRIPT = [
    "Hi! I just finished my flight.",
    "The stall exercise went okay overall, but my recoveries were a bit rough — I hesitated pushing the nose down at first because I was nervous about the altitude.",
    "I stalled fine once I set it up right. The one thing I'd do differently is clearing turns before we set up, I forgot to do them properly.",
    "Nothing really unplanned came up, weather stayed about the same as briefed.",
    "That's pretty much it, I think we're done. Can we wrap up and save the debrief?",
]


def main() -> None:
    agent = DebriefAgent("STU-0001", flight_id=6)  # FLT-0006: has its PreflightPackage + TechnicalLog rows
    print(f"=== Debrief Agent — flight context loaded ===\n{agent._flight_summary()}\n")

    for turn in SCRIPT:
        print(f"[student] {turn}\n")
        print(f"[debrief] {agent.chat(turn)}\n")

    print(f"[student] Can I also message my instructor?\n")
    print(f"[debrief] {agent.chat('Can I also message my instructor?')}\n")

    from backend.database import SessionLocal
    from backend.models import Debrief

    session = SessionLocal()
    d = (
        session.query(Debrief)
        .order_by(Debrief.id.desc())
        .first()
    )
    print("=== Saved Debrief record ===")
    print(f"id={d.id} flight_id={d.flight_id} student_id={d.student_id}")
    print(f"instructor_notes: {d.instructor_notes}")
    print(f"\nstudent_reported_feedback:\n{d.student_reported_feedback}")
    print(f"\nidentified_weak_points:\n{d.identified_weak_points}")
    print(f"\ncoaching_notes:\n{d.coaching_notes}")
    print(f"\nagent_conversation_log:")
    for entry in d.agent_conversation_log or []:
        print(f"  - Q: {entry.get('question')}\n    A: {entry.get('student_answer_summary')}")
    session.close()

    print(f"\n=== Instructor chat stub ===\n{open_instructor_chat()['message']}")


if __name__ == "__main__":
    main()
