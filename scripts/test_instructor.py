"""Phase 5 test: (a) link student to instructor, (b) instructor<->student messaging,
(c) unlinked-instructor access REJECTED (the security boundary), (d) instructor
running the reused Pre-flight Agent for the linked student's flight."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.instructor import (
    get_conversation,
    instructor_run_preflight,
    instructor_send,
    link_student,
    mark_read,
    student_send,
)
from backend.database import SessionLocal
from backend.models import Instructor


def ensure_second_instructor() -> int:
    session = SessionLocal()
    try:
        row = session.query(Instructor).filter_by(instructor_id="INS-0002").first()
        if row is None:
            row = Instructor(instructor_id="INS-0002", name="Other Instructor", school="Test Flight School")
            session.add(row)
            session.commit()
            session.refresh(row)
        return row.id
    finally:
        session.close()


def expect_rejection(label: str, fn):
    try:
        fn()
        print(f"[c] FAIL: {label} was NOT rejected")
    except PermissionError as exc:
        print(f"[c] OK rejected {label}: {exc}")


def main() -> None:
    print("=== (a) Link student to instructor ===")
    print(link_student(instructor_id=1, student_id=1))

    print("\n=== (b) Instructor messages student, student replies, read-back ===")
    print(instructor_send(1, 1, "Nice stall recovery work today. Let's review clearing turns next lesson."))
    print(student_send(1, 1, "Thanks! I'll add clearing turns to my pre-maneuver flow."))
    convo = get_conversation(student_id=1, instructor_id=1)
    for m in convo:
        print(f"  [{m['timestamp']}] {m['from']} -> {m['to']}: {m['message_text']} (read={m['read_status']})")
    if convo:
        print(mark_read(convo[0]["id"], reader_type="student", reader_id=1))

    other = ensure_second_instructor()
    print(f"\n=== (c) Unlinked instructor INS-0002 (id={other}) tries to access STU-0001 ===")
    expect_rejection("get_conversation", lambda: get_conversation(student_id=1, instructor_id=other))
    expect_rejection("instructor_send", lambda: instructor_send(other, 1, "hello?"))
    expect_rejection("instructor_run_preflight", lambda: instructor_run_preflight(other, 1, "hi"))

    print("\n=== (d) Linked instructor runs the reused Pre-flight Agent (live Gemini) ===")
    print(instructor_run_preflight(1, 1, "Quick pre-flight check for my upcoming KSQL Cessna 172 stall flight — pull the latest weather and flag anything I should verify."))


if __name__ == "__main__":
    main()
