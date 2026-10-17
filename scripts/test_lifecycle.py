"""Phase B lifecycle tests: invite-only signup, admin approval, status transitions, audit log."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from backend.api.auth import _hash
from backend.api.main import app
from backend.api.ratelimit import rate_limiter
from backend.database import SessionLocal, engine, Base
from backend.models import AdminUser, AuditLog, Instructor, Invite, Student

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=False)

ADMIN_EMAIL = "admin@test.com"
ADMIN_PASS = "admin-pass-123"


def _seed_admin():
    session = SessionLocal()
    try:
        existing = session.query(AdminUser).filter_by(email=ADMIN_EMAIL).first()
        if existing is None:
            a = AdminUser(email=ADMIN_EMAIL, name="Admin", hashed_password=_hash(ADMIN_PASS))
            session.add(a)
            session.commit()
            admin_id = a.id
        else:
            admin_id = existing.id
        return admin_id
    finally:
        session.close()


def _admin_token():
    r = client.post("/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _create_invite(admin_token, email, role="student"):
    r = client.post("/admin/invites", json={"email": email, "role": role},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, f"Invite creation failed: {r.status_code} {r.text}"
    return r.json()["invite_code"]


def _cleanup():
    rate_limiter.reset()
    session = SessionLocal()
    try:
        session.query(Student).filter(Student.email.like("%@example.com")).delete()
        session.query(Instructor).filter(Instructor.email.like("%@example.com")).delete()
        session.query(Invite).filter(Invite.email.like("%@example.com")).delete()
        session.query(AuditLog).delete()
        session.commit()
    finally:
        session.close()


def test_admin_login():
    _seed_admin()
    token = _admin_token()
    assert token is not None
    print("PASS: admin login works")


def test_non_admin_cannot_access_admin_endpoints():
    _seed_admin()
    _cleanup()
    invite_code = _create_invite(_admin_token(), "user1@example.com")
    r = client.post("/auth/student/signup", json={
        "name": "User One", "email": "user1@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 201
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email="user1@example.com").first()
        student_id = student.id
    finally:
        session.close()
    client.post("/admin/approve", json={"user_id": student_id, "user_type": "student"},
                headers={"Authorization": f"Bearer {_admin_token()}"})
    r = client.post("/auth/student/login", json={"email": "user1@example.com", "password": "password123"})
    assert r.status_code == 200, "Approved account should login"
    token = r.json()["access_token"]
    r = client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, "Non-admin should be rejected from admin endpoints"
    print("PASS: non-admin cannot access admin endpoints")


def test_invite_only_signup():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()

    r = client.post("/auth/student/signup", json={
        "name": "No Invite", "email": "noinvite@example.com", "password": "password123",
    })
    assert r.status_code == 422, f"Signup without invite_code should fail: {r.status_code}"

    r = client.post("/auth/student/signup", json={
        "name": "Bad Code", "email": "badcode@example.com",
        "password": "password123", "invite_code": "invalid-code-123",
    })
    assert r.status_code == 400, f"Signup with invalid code should fail: {r.status_code}"

    invite_code = _create_invite(admin_token, "invited@example.com")
    r = client.post("/auth/student/signup", json={
        "name": "Invited", "email": "invited@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 201, f"Invite signup should succeed: {r.status_code} {r.text}"
    assert r.json()["status"] == "pending"

    r = client.post("/auth/student/signup", json={
        "name": "Reuse", "email": "reuse@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 400, "Invite code should not be reusable"

    print("PASS: invite-only signup enforced")


def test_wrong_email_invite():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "correct@example.com")
    r = client.post("/auth/student/signup", json={
        "name": "Wrong", "email": "wrong@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 400, "Signup with wrong email should fail"
    print("PASS: invite email mismatch rejected")


def test_approve_and_login():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "approve@example.com")
    r = client.post("/auth/student/signup", json={
        "name": "Approve", "email": "approve@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 201

    r = client.post("/auth/student/login", json={"email": "approve@example.com", "password": "password123"})
    assert r.status_code == 403, "Pending account should not login"

    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email="approve@example.com").first()
        student_id = student.id
    finally:
        session.close()

    r = client.post("/admin/approve", json={"user_id": student_id, "user_type": "student"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200

    r = client.post("/auth/student/login", json={"email": "approve@example.com", "password": "password123"})
    assert r.status_code == 200, "Active account should login"
    print("PASS: approve then login works")


def test_suspend_revoke_expired():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "status@example.com")
    client.post("/auth/student/signup", json={
        "name": "Status", "email": "status@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email="status@example.com").first()
        student_id = student.id
    finally:
        session.close()

    client.post("/admin/approve", json={"user_id": student_id, "user_type": "student"},
                headers={"Authorization": f"Bearer {admin_token}"})

    for status in ["suspended", "revoked", "expired", "active"]:
        r = client.post("/admin/status", json={"user_id": student_id, "user_type": "student", "status": status},
                        headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, f"Status change to {status} failed: {r.status_code}"

    for blocked_status in ["suspended", "revoked", "expired"]:
        client.post("/admin/status", json={"user_id": student_id, "user_type": "student", "status": blocked_status},
                    headers={"Authorization": f"Bearer {admin_token}"})
        r = client.post("/auth/student/login", json={"email": "status@example.com", "password": "password123"})
        assert r.status_code == 403, f"Account with status {blocked_status} should not login"

    print("PASS: suspend/revoke/expire block login, active restores it")


def test_extend_expired():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "extend@example.com")
    client.post("/auth/student/signup", json={
        "name": "Extend", "email": "extend@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email="extend@example.com").first()
        student_id = student.id
    finally:
        session.close()

    client.post("/admin/status", json={"user_id": student_id, "user_type": "student", "status": "expired"},
                headers={"Authorization": f"Bearer {admin_token}"})
    r = client.post("/admin/extend", json={"user_id": student_id, "user_type": "student", "days": 30},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    r = client.post("/auth/student/login", json={"email": "extend@example.com", "password": "password123"})
    assert r.status_code == 200, "Extend should reactivate expired account"
    print("PASS: extend reactivates expired account")


def test_audit_log():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "audit@example.com")
    client.post("/auth/student/signup", json={
        "name": "Audit", "email": "audit@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email="audit@example.com").first()
        student_id = student.id
    finally:
        session.close()
    client.post("/admin/approve", json={"user_id": student_id, "user_type": "student"},
                headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/admin/status", json={"user_id": student_id, "user_type": "student", "status": "suspended"},
                headers={"Authorization": f"Bearer {admin_token}"})

    r = client.get("/admin/audit-log", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    actions = [a["action"] for a in r.json()]
    assert "invite_created" in actions
    assert "user_approved" in actions
    assert "user_suspended" in actions
    print("PASS: audit log records admin actions")


def test_expired_invite():
    _seed_admin()
    _cleanup()
    session = SessionLocal()
    try:
        from datetime import datetime, timedelta, timezone
        invite = Invite(
            email="expired@example.com", role="student", code="expired-code-123",
            created_by_admin_id=session.query(AdminUser).filter_by(email=ADMIN_EMAIL).first().id,
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        session.add(invite)
        session.commit()
    finally:
        session.close()
    r = client.post("/auth/student/signup", json={
        "name": "Expired", "email": "expired@example.com",
        "password": "password123", "invite_code": "expired-code-123",
    })
    assert r.status_code == 400, "Expired invite should be rejected"
    print("PASS: expired invite rejected")


def test_revoked_invite():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "revoked@example.com")
    session = SessionLocal()
    try:
        invite = session.query(Invite).filter_by(code=invite_code).first()
        from datetime import datetime, timezone
        invite.revoked_at = datetime.now(timezone.utc)
        session.commit()
    finally:
        session.close()
    r = client.post("/auth/student/signup", json={
        "name": "Revoked", "email": "revoked@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 400, "Revoked invite should be rejected"
    print("PASS: revoked invite rejected")


def test_revoke_invite():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "torevoke@example.com")
    session = SessionLocal()
    try:
        invite = session.query(Invite).filter_by(code=invite_code).first()
        invite_id = invite.id
        session.close()
    except Exception:
        session.close()
        raise

    r = client.post("/admin/invites/revoke", json={"invite_id": invite_id},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, f"Revoke should succeed: {r.status_code} {r.text}"

    r = client.post("/auth/student/signup", json={
        "name": "Revoked", "email": "torevoke@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 400, "Signup with revoked invite should fail"

    r = client.post("/admin/invites/revoke", json={"invite_id": 99999},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404, "Revoking nonexistent invite should 404"

    print("PASS: invite revocation blocks signup, nonexistent returns 404")


def test_wrong_role_invite():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    invite_code = _create_invite(admin_token, "rolecheck@example.com", role="instructor")
    r = client.post("/auth/student/signup", json={
        "name": "RoleCheck", "email": "rolecheck@example.com",
        "password": "password123", "invite_code": invite_code,
    })
    assert r.status_code == 400, "Using instructor invite for student signup should fail"
    print("PASS: role mismatch on invite rejected")


if __name__ == "__main__":
    _cleanup()
    test_admin_login()
    test_non_admin_cannot_access_admin_endpoints()
    test_invite_only_signup()
    test_wrong_email_invite()
    test_approve_and_login()
    test_suspend_revoke_expired()
    test_extend_expired()
    test_audit_log()
    test_expired_invite()
    test_revoked_invite()
    test_revoke_invite()
    test_wrong_role_invite()
    print("\nAll lifecycle tests passed.")

