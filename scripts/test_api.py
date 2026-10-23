"""Phase 8 API test: public signup (no invite required), login, student preflight
via JWT, instructor link+message via JWT, role-mismatch rejection, and
missing/garbage token rejection."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from backend.api.auth import _hash
from backend.api.main import app
from backend.api.ratelimit import rate_limiter
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
    rate_limiter.reset()
    student_id = seed_users()

    print("=== (a) Public signup succeeds without an invite ===")
    r1 = client.post("/auth/student/signup", json={"name": "Pub Stu", "email": "pub-student@test.com", "password": PASSWORD})
    print("student signup ->", r1.status_code, r1.json())
    assert r1.status_code == 201
    assert r1.json()["status"] == "active"
    r2 = client.post("/auth/instructor/signup", json={"name": "Pub Ins", "email": "pub-instructor@test.com", "password": PASSWORD})
    print("instructor signup ->", r2.status_code, r2.json())
    assert r2.status_code == 201
    assert r2.json()["status"] == "active"
    # Bogus invite codes are still rejected.
    r3 = client.post("/auth/student/signup", json={"name": "X", "email": "pub-bogus@test.com", "password": PASSWORD, "invite_code": "bogus"})
    print("student signup with bogus invite ->", r3.status_code)
    assert r3.status_code == 400
    # Duplicate email rejected.
    r4 = client.post("/auth/student/signup", json={"name": "Dup", "email": "pub-student@test.com", "password": PASSWORD})
    print("duplicate email signup ->", r4.status_code)
    assert r4.status_code == 400
    # Extra fields like role=admin are ignored — endpoint-controlled role only.
    r5 = client.post("/auth/student/signup", json={"name": "Evil", "email": "pub-evil@test.com", "password": PASSWORD, "role": "admin", "account_status": "active"})
    print("signup with role=admin extra field ->", r5.status_code)
    assert r5.status_code == 201
    ra = client.post("/auth/admin/login", json={"email": "pub-evil@test.com", "password": PASSWORD})
    print("admin login with that account ->", ra.status_code)
    assert ra.status_code == 401
    rs = client.post("/auth/student/login", json={"email": "pub-evil@test.com", "password": PASSWORD})
    print("student login with that account ->", rs.status_code)
    assert rs.status_code == 200

    print("\n=== (b) Login after public signup returns a working token ===")
    rl = client.post("/auth/student/login", json={"email": "pub-student@test.com", "password": PASSWORD})
    print("login ->", rl.status_code)
    assert rl.status_code == 200
    token_new = rl.json()["access_token"]
    rf = client.get("/student/flights", headers=auth(token_new))
    print("new student token on /student/flights ->", rf.status_code)
    assert rf.status_code == 200

    print("\n=== (c) Login both seeded users, get JWTs ===")
    ts = client.post("/auth/student/login", json={"email": STUDENT_EMAIL, "password": PASSWORD}).json()["access_token"]
    ti = client.post("/auth/instructor/login", json={"email": INSTRUCTOR_EMAIL, "password": PASSWORD}).json()["access_token"]
    print("student token acquired:", bool(ts), "| instructor token acquired:", bool(ti))

    print("\n=== (d) Instructor token -> link student + send message ===")
    r = client.post("/instructor/link-student", json={"student_id": student_id}, headers=auth(ti))
    print(r.status_code, r.json())
    r = client.post("/instructor/messages", json={"student_id": student_id, "message_text": "Nice work."}, headers=auth(ti))
    print(r.status_code)

    print("\n=== (e) Cross-role access must be rejected ===")
    r = client.post("/student/chat", json={"message": "hi"}, headers=auth(ti))
    print("instructor token on /student/chat ->", r.status_code)
    assert r.status_code == 403
    r = client.post("/instructor/messages", json={"student_id": student_id, "message_text": "hi"}, headers=auth(ts))
    print("student token on /instructor/messages ->", r.status_code)
    assert r.status_code == 403

    print("\n=== (f) Missing / garbage token must be 401 ===")
    r = client.get("/student/flights")
    print("no token ->", r.status_code)
    assert r.status_code == 401
    r = client.get("/student/flights", headers={"Authorization": "Bearer garbage-token"})
    print("garbage token ->", r.status_code)
    assert r.status_code == 401

    print("\nAll API regression checks passed.")


if __name__ == "__main__":
    main()
