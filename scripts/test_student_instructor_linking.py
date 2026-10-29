"""Student ID visibility + instructor-student linking tests.

Covers:
- GET /student/me returns the authenticated student's own Student ID/name.
- Students cannot reach instructor-only linking endpoints (403) and unauthenticated calls (401).
- Instructors can look up a Student ID (found / not found).
- Instructor can link a valid Student ID; linked student shows up in the instructor list.
- Re-linking the same student to the same instructor is idempotent; linking to another instructor is rejected (409).
- Instructor cannot access an unlinked student's records.
- Student ownership of /student/me (own id only) holds.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from backend.api.auth import _hash
from backend.api.main import app
from backend.api.ratelimit import rate_limiter
from backend.database import SessionLocal, engine, Base
from backend.models import AuditLog, Debrief, Flight, Instructor, Invite, PreflightPackage, Student
from backend.models import AdminUser

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=False)

ADMIN_EMAIL = "admin@test.com"
ADMIN_PASS = "admin-pass-123"
STUDENT_EMAIL = "student-link-1@example.com"
STUDENT_PASS = "password123"
INSTRUCTOR_EMAIL = "instructor-link-1@example.com"
INSTRUCTOR_PASS = "password123"


def _seed_admin():
    session = SessionLocal()
    try:
        admin = session.query(AdminUser).filter_by(email=ADMIN_EMAIL).first()
        if admin is None:
            admin = AdminUser(email=ADMIN_EMAIL, name="Admin", hashed_password=_hash(ADMIN_PASS))
            session.add(admin)
            session.commit()
            admin_id = admin.id
        else:
            admin_id = admin.id
        return admin_id
    finally:
        session.close()


def _admin_token():
    r = client.post("/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _student_token():
    r = client.post("/auth/student/signup", json={
        "name": "Link Student", "email": STUDENT_EMAIL, "password": STUDENT_PASS,
    })
    assert r.status_code == 201, f"Student signup failed: {r.status_code} {r.text}"
    student_id = r.json()["student_id"]
    r = client.post("/auth/student/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASS})
    assert r.status_code == 200, f"Student login failed: {r.status_code} {r.text}"
    return r.json()["access_token"], student_id


def _instructor_token(n: int = 1):
    email = f"instructor-link-{n}@example.com"
    r = client.post("/auth/instructor/signup", json={
        "name": "Link Instructor", "email": email, "password": INSTRUCTOR_PASS,
    })
    if r.status_code == 400:
        r = client.post("/auth/instructor/login", json={"email": email, "password": INSTRUCTOR_PASS})
    assert r.status_code == 201 or r.status_code == 200, f"Instructor auth failed: {r.status_code} {r.text}"
    instructor_id = r.json()["instructor_id"]
    r = client.post("/auth/instructor/login", json={"email": email, "password": INSTRUCTOR_PASS})
    assert r.status_code == 200, f"Instructor login failed: {r.status_code} {r.text}"
    return r.json()["access_token"], instructor_id


def _cleanup():
    rate_limiter.reset()
    session = SessionLocal()
    try:
        session.query(Debrief).delete()
        session.query(PreflightPackage).delete()
        session.query(Flight).delete()
        session.query(Student).filter(Student.email.like("%link-1%")).delete()
        session.query(Instructor).filter(Instructor.email.like("%link-1%")).delete()
        session.query(Invite).filter(Invite.email.like("%link-1%")).delete()
        session.query(AuditLog).delete()
        session.commit()
    finally:
        session.close()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_student_me_returns_own_id():
    _cleanup()
    token, student_id = _student_token()
    r = client.get("/student/me", headers=_h(token))
    assert r.status_code == 200, f"/student/me failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["student_id"] == student_id, f"Expected own id {student_id}, got {data.get('student_id')}"
    assert data["name"]
    assert "linked_instructor" in data
    print("PASS: /student/me returns the authenticated student's own Student ID and name")


def test_student_me_is_scoped_to_authenticated_student():
    _cleanup()
    token, student_id = _student_token()
    r = client.get("/student/me", headers=_h(token))
    assert r.status_code == 200
    assert r.json()["student_id"] == student_id
    print("PASS: /student/me only exposes the authenticated student's own identity")


def test_student_me_requires_auth():
    _cleanup()
    r = client.get("/student/me")
    assert r.status_code == 401, f"Unauthenticated /student/me must be rejected: {r.status_code}"
    print("PASS: unauthenticated /student/me rejected")


def test_student_cannot_call_instructor_endpoint():
    _cleanup()
    token, _student_id = _student_token()
    r = client.get("/instructor/students", headers=_h(token))
    assert r.status_code == 403, f"Student must not call instructor endpoint: {r.status_code}"
    r = client.post("/instructor/link-student", json={"student_id": "STU-0001"}, headers=_h(token))
    assert r.status_code == 403, f"Student must not link a student: {r.status_code}"
    print("PASS: student account cannot call instructor-only linking endpoints")


def test_instructor_lookup_by_student_id():
    _cleanup()
    token, _instructor_id = _instructor_token()
    headers = _h(token)
    _, student_id = _student_token()
    r = client.get(f"/instructor/students/{student_id}", headers=headers)
    assert r.status_code == 200, f"Lookup failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["found"] is True
    assert body["student_id"] == student_id
    assert body["name"]
    r = client.get("/instructor/students/STU-9999", headers=headers)
    assert r.status_code == 404, f"Unknown student ID must be rejected: {r.status_code}"
    print("PASS: instructor lookup finds valid Student ID and rejects unknown ones")


def test_valid_link_succeeds_and_lists_student():
    _cleanup()
    student_token, student_id = _student_token()
    instructor_token, instructor_id = _instructor_token()
    headers = _h(instructor_token)
    r = client.post("/instructor/link-student", json={"student_id": student_id}, headers=headers)
    assert r.status_code == 200, f"Valid link failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["linked"] is True
    assert body["student"] == student_id
    r = client.get("/instructor/students", headers=headers)
    assert r.status_code == 200
    rows = r.json()
    assert any(row["student_id"] == student_id for row in rows), f"Linked student missing from list: {rows}"
    print("PASS: valid instructor to student link succeeds and appears in instructor list")


def test_duplicate_link_is_idempotent_for_same_instructor():
    _cleanup()
    student_token, student_id = _student_token()
    instructor_token, instructor_id = _instructor_token()
    headers = _h(instructor_token)
    r1 = client.post("/instructor/link-student", json={"student_id": student_id}, headers=headers)
    assert r1.status_code == 200, f"First link failed: {r1.status_code} {r1.text}"
    r2 = client.post("/instructor/link-student", json={"student_id": student_id}, headers=headers)
    assert r2.status_code == 200, f"Duplicate link should be idempotent: {r2.status_code} {r2.text}"
    assert r2.json().get("already_linked") is True
    print("PASS: duplicate link by the same instructor is handled idempotently")


def test_student_linked_to_other_instructor_is_rejected():
    _cleanup()
    student_token, student_id = _student_token()
    instructor_token, instructor_id = _instructor_token(1)
    headers = _h(instructor_token)
    r1 = client.post("/instructor/link-student", json={"student_id": student_id}, headers=headers)
    assert r1.status_code == 200
    other_token, other_instructor_id = _instructor_token(2)
    r2 = client.post("/instructor/link-student", json={"student_id": student_id}, headers=_h(other_token))
    assert r2.status_code == 409, f"Relinking to another instructor must be rejected: {r2.status_code} {r2.text}"
    print("PASS: student already linked to another instructor cannot be re-linked")


def test_instructor_cannot_access_unlinked_student():
    _cleanup()
    student_token, student_id = _student_token()
    instructor_token, instructor_id = _instructor_token()
    headers = _h(instructor_token)
    r = client.get(f"/instructor/messages/{student_id}", headers=headers)
    assert r.status_code == 403, f"Unlinked student access must be rejected: {r.status_code}"
    print("PASS: instructor cannot access unlinked student")


def test_unauthenticated_link_rejected():
    _cleanup()
    r = client.post("/instructor/link-student", json={"student_id": "STU-0001"})
    assert r.status_code == 401, f"Unauthenticated link must be rejected: {r.status_code}"
    print("PASS: unauthenticated instructor link rejected")


if __name__ == "__main__":
    _cleanup()
    _seed_admin()
    test_student_me_returns_own_id()
    test_student_me_is_scoped_to_authenticated_student()
    test_student_me_requires_auth()
    test_student_cannot_call_instructor_endpoint()
    test_instructor_lookup_by_student_id()
    test_valid_link_succeeds_and_lists_student()
    test_duplicate_link_is_idempotent_for_same_instructor()
    test_student_linked_to_other_instructor_is_rejected()
    test_instructor_cannot_access_unlinked_student()
    test_unauthenticated_link_rejected()
    print("\nAll student-instructor linking tests passed.")

