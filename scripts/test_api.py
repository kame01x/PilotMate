"""Phase 8 API test: login, student preflight via JWT, instructor link+message
via JWT, role-mismatch rejection, and missing/garbage token rejection.
Signup is now invite-only (Phase A/B), so users are seeded directly."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from backend.api.auth import _hash
from backend.api.main import app
from backend.database import SessionLocal
from backend.models import Instructor, Student

client = TestClient(app)

STUDENT_EMAIL = "student.demo@example.com"
INSTRUCTOR_EMAIL = "instructor.demo@example.com"
PASSWORD = "strong-pass-123"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def seed_users():
    session = SessionLocal()
    try:
        s = session.query(Student).filter_by(email=STUDENT_EMAIL).first()
        if s is None:
            s = Student(
                student_id="STU-0100", name="Demo Student", email=STUDENT_EMAIL,
                hashed_password=_hash(PASSWORD), account_status="active",
            )
            session.add(s)
        i = session.query(Instructor).filter_by(email=INSTRUCTOR_EMAIL).first()
        if i is None:
            i = Instructor(
                instructor_id="INS-0100", name="Demo Instructor", email=INSTRUCTOR_EMAIL,
                hashed_password=_hash(PASSWORD), account_status="active",
            )
            session.add(i)
        session.commit()
        student_id = s.student_id
        return student_id
    finally:
        session.close()


def main() -> None:
    student_id = seed_users()

    print("=== (a) Public signup must be blocked ===")
    r1 = client.post("/auth/student/signup", json={"name": "X", "email": "x@test.com", "password": PASSWORD})
    print("student signup ->", r1.status_code, r1.json())
    assert r1.status_code == 422
    r2 = client.post("/auth/instructor/signup", json={"name": "X", "email": "y@test.com", "password": PASSWORD})
    print("instructor signup ->", r2.status_code, r2.json())
    assert r2.status_code == 422
    r3 = client.post("/auth/student/signup", json={"name": "X", "email": "x@test.com", "password": PASSWORD, "invite_code": "bogus"})
    print("student signup with bogus invite ->", r3.status_code)
    assert r3.status_code == 400

    print("\n=== (b) Login both, get JWTs ===")
    ts = client.post("/auth/student/login", json={"email": STUDENT_EMAIL, "password": PASSWORD}).json()["access_token"]
    ti = client.post("/auth/instructor/login", json={"email": INSTRUCTOR_EMAIL, "password": PASSWORD}).json()["access_token"]
    print("student token acquired:", bool(ts), "| instructor token acquired:", bool(ti))

    print("\n=== (c) Instructor token -> link student + send message ===")
    r = client.post("/instructor/link-student", json={"student_id": student_id}, headers=auth(ti))
    print(r.status_code, r.json())
    r = client.post("/instructor/messages", json={"student_id": student_id, "message_text": "Nice work."}, headers=auth(ti))
    print(r.status_code)

    print("\n=== (d) Cross-role access must be rejected ===")
    r = client.post("/student/chat", json={"message": "hi"}, headers=auth(ti))
    print("instructor token on /student/chat ->", r.status_code)
    assert r.status_code == 403
    r = client.post("/instructor/messages", json={"student_id": student_id, "message_text": "hi"}, headers=auth(ts))
    print("student token on /instructor/messages ->", r.status_code)
    assert r.status_code == 403

    print("\n=== (e) Missing / garbage token must be 401 ===")
    r = client.get("/student/flights")
    print("no token ->", r.status_code)
    assert r.status_code == 401
    r = client.get("/student/flights", headers={"Authorization": "Bearer garbage-token"})
    print("garbage token ->", r.status_code)
    assert r.status_code == 401

    print("\nAll API regression checks passed.")


if __name__ == "__main__":
    main()
