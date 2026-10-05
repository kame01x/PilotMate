import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.models import Instructor, Student


def seed_db() -> None:
    session = SessionLocal()
    try:
        existing_student = session.query(Student).filter_by(student_id="STU-0001").first()
        if existing_student:
            print("Seed data already exists. Skipping.")
            return

        instructor = Instructor(
            instructor_id="INS-0001",
            name="Test Instructor",
            school="Test Flight School",
        )
        session.add(instructor)
        session.flush()

        student = Student(
            student_id="STU-0001",
            name="Test Student",
            school="Test Flight School",
            country="Test Country",
            authority="FAA",
            home_airport="KTEST",
            linked_instructor_id=instructor.id,
        )
        session.add(student)
        session.commit()
        print("Seed data inserted: 1 student (STU-0001), 1 instructor (INS-0001).")
    finally:
        session.close()


if __name__ == "__main__":
    seed_db()
