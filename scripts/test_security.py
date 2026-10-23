"""Security tests for Phase A fixes."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal, engine, Base
from backend.models import Student, Instructor, Aircraft
from backend.api.auth import _hash
from fastapi.testclient import TestClient
from backend.api.main import app

Base.metadata.create_all(bind=engine)

client = TestClient(app, raise_server_exceptions=False)


def _seed():
    session = SessionLocal()
    try:
        session.query(Student).delete()
        session.query(Instructor).delete()
        session.query(Aircraft).delete()
        session.commit()
        s = Student(
            student_id="STU-0001", name="Alice", email="alice@example.com",
            hashed_password=_hash("password123"), account_status="active",
        )
        s2 = Student(
            student_id="STU-0002", name="Bob", email="bob@example.com",
            hashed_password=_hash("password123"), account_status="active",
        )
        inactive = Student(
            student_id="STU-0003", name="Carol", email="carol@example.com",
            hashed_password=_hash("password123"), account_status="pending",
        )
        session.add_all([s, s2, inactive])
        session.commit()
        ac = Aircraft(
            registration="N12345", aircraft_type="Cessna 172",
            schedule={"mass_unit": "kg", "arm_unit": "cm", "empty_mass": 700, "empty_arm": 110,
                       "stations": [{"id": "pilot", "label": "Pilot", "arm": 100, "kind": "seat"}]},
            owner_student_id=s.id,
        )
        session.add(ac)
        session.commit()
        alice_id = s.id
        session.close()
        return alice_id
    except Exception:
        session.rollback()
        session.close()
        raise


def _login(email, password="password123"):
    r = client.post("/auth/student/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json()["access_token"]
    return None


def test_public_registration_allowed():
    r = client.post("/auth/student/signup", json={
        "name": "Public Stu", "email": "public-stu@example.com", "password": "password123"
    })
    assert r.status_code == 201, f"Expected 201 (public student signup), got {r.status_code} {r.text}"
    assert r.json()["status"] == "active"
    r = client.post("/auth/instructor/signup", json={
        "name": "Public Ins", "email": "public-ins@example.com", "password": "password123"
    })
    assert r.status_code == 201, f"Expected 201 (public instructor signup), got {r.status_code} {r.text}"
    assert r.json()["status"] == "active"
    print("PASS: public registration allowed without invite (201, active)")


def test_invalid_invite_rejected():
    r = client.post("/auth/student/signup", json={
        "name": "Hacker", "email": "hacker@example.com", "password": "password123",
        "invite_code": "bogus-code-xyz"
    })
    assert r.status_code == 400, f"Expected 400 (invalid invite code), got {r.status_code}"
    print("PASS: invalid invite code rejected (400)")


def test_duplicate_email_rejected():
    r = client.post("/auth/student/signup", json={
        "name": "Alice Again", "email": "alice@example.com", "password": "password123"
    })
    assert r.status_code == 400, f"Expected 400 (duplicate email), got {r.status_code}"
    print("PASS: duplicate email rejected (400)")


def test_admin_role_escalation_blocked():
    r = client.post("/auth/student/signup", json={
        "name": "Evil", "email": "evil-admin@example.com", "password": "password123",
        "role": "admin", "account_status": "active", "is_admin": True,
    })
    assert r.status_code == 201, f"Signup should succeed, got {r.status_code} {r.text}"
    # The submitted role field must be ignored — only the endpoint assigns roles.
    ra = client.post("/auth/admin/login", json={"email": "evil-admin@example.com", "password": "password123"})
    assert ra.status_code == 401, f"Admin login must fail for a self-registered user, got {ra.status_code}"
    rs = client.post("/auth/student/login", json={"email": "evil-admin@example.com", "password": "password123"})
    assert rs.status_code == 200, f"Student login should work, got {rs.status_code}"
    token = rs.json()["access_token"]
    r2 = client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 403, f"Student token must be rejected from admin endpoints, got {r2.status_code}"
    print("PASS: role=admin extra field ignored, no admin escalation")


def test_inactive_account_cannot_login():
    _seed()
    r = client.post("/auth/student/login", json={"email": "carol@example.com", "password": "password123"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
    print("PASS: inactive account cannot login (403)")


def test_active_account_can_login():
    _seed()
    token = _login("alice@example.com")
    assert token is not None, "Active account should be able to login"
    print("PASS: active account can login")


def test_invalid_credentials():
    r = client.post("/auth/student/login", json={"email": "alice@example.com", "password": "wrongpass"})
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("PASS: invalid credentials return 401")


def test_aircraft_ownership_enforced():
    _seed()
    token_alice = _login("alice@example.com")
    token_bob = _login("bob@example.com")
    h = {"Authorization": f"Bearer {token_bob}"}

    r = client.get("/student/aircraft/N12345", headers=h)
    assert r.status_code == 403, f"Expected 403 for non-owner GET, got {r.status_code}"

    r = client.put("/student/aircraft/N12345", headers=h, json={
        "schedule": {"mass_unit": "kg", "arm_unit": "cm", "empty_mass": 700, "empty_arm": 110,
                      "stations": [{"id": "pilot", "label": "Pilot", "arm": 100, "kind": "seat"}]}
    })
    assert r.status_code == 403, f"Expected 403 for non-owner PUT, got {r.status_code}"

    r = client.post("/student/mass-balance/calculate", headers=h, json={
        "registration": "N12345", "loads": [], "fuel": []
    })
    assert r.status_code == 403, f"Expected 403 for non-owner calculate, got {r.status_code}"

    h_alice = {"Authorization": f"Bearer {token_alice}"}
    r = client.get("/student/aircraft/N12345", headers=h_alice)
    assert r.status_code == 200, f"Owner GET should succeed, got {r.status_code}"

    print("PASS: aircraft ownership enforced (GET, PUT, calculate)")


def test_error_handler_no_stack_trace():
    r = client.get("/student/debriefs/99999", headers={"Authorization": "Bearer invalid_token_xyz"})
    assert r.status_code in (401, 403), f"Expected auth error, got {r.status_code}"
    body = r.text.lower()
    assert "traceback" not in body, "Response should not contain traceback"
    assert "sqlalchemy" not in body, "Response should not leak SQLAlchemy"
    assert "file" not in body or "site-packages" not in body, "Response should not leak internal paths"
    print("PASS: no stack traces in error responses")


def test_health_endpoint():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    print("PASS: health endpoint returns 200")


def test_unauthenticated_student_endpoint():
    r = client.post("/student/chat", json={"message": "hello"})
    assert r.status_code == 401, f"Expected 401 for no token, got {r.status_code}"
    print("PASS: unauthenticated request rejected (401)")


def test_stale_jwt_blocked_after_status_change():
    _seed()
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email="alice@example.com").first()
        student_pk = student.id
        student_id_str = student.student_id
        session.close()
    except Exception:
        session.close()
        raise

    token = _login("alice@example.com")
    assert token is not None
    h = {"Authorization": f"Bearer {token}"}

    r = client.get("/student/flights", headers=h)
    assert r.status_code == 200, f"Active user should get 200, got {r.status_code}"

    for status in ["suspended", "revoked", "expired"]:
        session = SessionLocal()
        try:
            student = session.query(Student).filter_by(id=student_pk).first()
            student.account_status = status
            session.commit()
            session.close()
        except Exception:
            session.close()
            raise

        r = client.get("/student/flights", headers=h)
        assert r.status_code == 401, f"Status {status} should return 401 with old token, got {r.status_code}"
        r = client.post("/student/chat", json={"message": "hi"}, headers=h)
        assert r.status_code == 401, f"Status {status} should return 401 on /student/chat, got {r.status_code}"

    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(id=student_pk).first()
        student.account_status = "active"
        session.commit()
        session.close()
    except Exception:
        session.close()
        raise

    r = client.get("/student/flights", headers=h)
    assert r.status_code == 200, f"Restored active user should get 200, got {r.status_code}"

    print("PASS: stale JWT blocked after status change (401 on suspended/revoked/expired)")


def test_stale_jwt_instructor_blocked():
    session = SessionLocal()
    try:
        session.query(Instructor).delete()
        session.commit()
        ins = Instructor(
            instructor_id="INS-0001", name="TestIns", email="ins@example.com",
            hashed_password=_hash("password123"), account_status="active",
        )
        session.add(ins)
        session.commit()
        ins_pk = ins.id
        session.close()
    except Exception:
        session.close()
        raise

    r = client.post("/auth/instructor/login", json={"email": "ins@example.com", "password": "password123"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    r = client.get("/instructor/students", headers=h)
    assert r.status_code == 200, f"Active instructor should get 200, got {r.status_code}"

    session = SessionLocal()
    try:
        ins = session.query(Instructor).filter_by(id=ins_pk).first()
        ins.account_status = "suspended"
        session.commit()
        session.close()
    except Exception:
        session.close()
        raise

    r = client.get("/instructor/students", headers=h)
    assert r.status_code == 401, f"Suspended instructor should get 401, got {r.status_code}"

    session = SessionLocal()
    try:
        session.query(Instructor).filter_by(id=ins_pk).delete()
        session.commit()
        session.close()
    except Exception:
        session.close()
        raise

    print("PASS: stale instructor JWT blocked after suspension (401)")


if __name__ == "__main__":
    _seed()
    test_public_registration_allowed()
    test_invalid_invite_rejected()
    test_duplicate_email_rejected()
    test_admin_role_escalation_blocked()
    test_inactive_account_cannot_login()
    test_active_account_can_login()
    test_invalid_credentials()
    test_aircraft_ownership_enforced()
    test_error_handler_no_stack_trace()
    test_health_endpoint()
    test_unauthenticated_student_endpoint()
    test_stale_jwt_blocked_after_status_change()
    test_stale_jwt_instructor_blocked()
    print("\nAll security tests passed.")

