"""Phase 8 API test: signup/login, student preflight via JWT, instructor link+message
via JWT, role-mismatch rejection, and missing/garbage token rejection."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from backend.api.main import app

client = TestClient(app)

STUDENT_EMAIL = "student.demo@example.com"
INSTRUCTOR_EMAIL = "instructor.demo@example.com"
PASSWORD = "strong-pass-123"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def main() -> None:
    print("=== (a) Signup student + instructor ===")
    r1 = client.post("/auth/student/signup", json={"name": "Demo Student", "email": STUDENT_EMAIL, "password": PASSWORD})
    print(r1.status_code, r1.json())
    r2 = client.post("/auth/instructor/signup", json={"name": "Demo Instructor", "email": INSTRUCTOR_EMAIL, "password": PASSWORD})
    print(r2.status_code, r2.json())
    student_id = r1.json()["student_id"]

    print("\n=== (b) Login both, get JWTs ===")
    ts = client.post("/auth/student/login", json={"email": STUDENT_EMAIL, "password": PASSWORD}).json()["access_token"]
    ti = client.post("/auth/instructor/login", json={"email": INSTRUCTOR_EMAIL, "password": PASSWORD}).json()["access_token"]
    print("student token acquired:", bool(ts), "| instructor token acquired:", bool(ti))

    print("\n=== (c) Student token -> pre-flight session (act on behalf of self only) ===")
    r = client.post("/student/preflight", json={"message": "Brief pre-flight for a local KSQL C172 stall flight today."}, headers=auth(ts))
    print(r.status_code)
    print(r.json()["response"][:400])

    print("\n=== (d) Instructor token -> link student + send message ===")
    print(client.post("/instructor/link-student", json={"student_id": student_id}, headers=auth(ti)).status_code,
          client.post("/instructor/link-student", json={"student_id": student_id}, headers=auth(ti)).json())
    print(client.post("/instructor/messages", json={"student_id": student_id, "message_text": "Nice work — review clearing turns next lesson."}, headers=auth(ti)).status_code)

    print("\n=== (e) Cross-role access must be rejected ===")
    r = client.post("/student/preflight", json={"message": "hi"}, headers=auth(ti))
    print("instructor token on /student/preflight ->", r.status_code, r.json())
    r = client.post("/instructor/messages", json={"student_id": student_id, "message_text": "hi"}, headers=auth(ts))
    print("student token on /instructor/messages ->", r.status_code, r.json())

    print("\n=== (f) Missing / garbage token must be 401 ===")
    r = client.get("/student/flights")
    print("no token ->", r.status_code, r.json())
    r = client.get("/student/flights", headers={"Authorization": "Bearer garbage-token"})
    print("garbage token ->", r.status_code, r.json())


if __name__ == "__main__":
    main()
