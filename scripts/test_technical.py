"""Simulates (a) Technical Agent opened for exercise 'stall' tied to the student's
current flight, and (b) a free-form regulation-specific question (authority flagging)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.technical_agent import TechnicalAgent


def main() -> None:
    print("=== (a) Exercise mode: 'stall', tied to current flight ===\n")
    agent = TechnicalAgent("STU-0001")
    print(f"[student] Open technical agent for exercise: stall\n")
    print(agent.start_exercise("stall"))

    print("\n\n=== (b) Free-form open topic: regulation-specific question ===\n")
    agent2 = TechnicalAgent("STU-0001")
    question = "What are the VFR weather minimums in Class D airspace?"
    print(f"[student] {question}\n")
    print(agent2.chat(question))

    print("\n\n=== Logged TechnicalLog rows ===\n")
    from backend.database import SessionLocal
    from backend.models import TechnicalLog

    session = SessionLocal()
    for row in session.query(TechnicalLog).order_by(TechnicalLog.id).all():
        print(f"- id={row.id} flight_id={row.flight_id} topic={row.topic!r} type={row.exchange_type}")
        print(f"  key_points={row.key_points}")
        print(f"  authority_caveat={row.authority_caveat}")
    session.close()


if __name__ == "__main__":
    main()
