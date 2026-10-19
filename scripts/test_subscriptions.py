"""Subscription / beta / admin-dashboard / Stripe-webhook tests.

Covers: admin-only access, self-grant prevention, beta grant/revoke, paid-
feature enforcement (trial/active/canceled/past_due/expired), webhook
signature verification + idempotency, checkout setup/test-mode guards.

No real Stripe network calls: webhook events are crafted and signed locally;
checkout success paths are exercised only up to validation (documented in
docs/16-subscriptions-stripe.md as a manual test-mode step).
"""
import json
import sys
import time
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import backend.config as config
from backend.api.auth import _hash
from backend.api.main import app
from backend.api.ratelimit import rate_limiter
from backend.database import SessionLocal, engine, Base
from backend.models import AdminUser, AuditLog, Instructor, Invite, Student, StripeEvent, Subscription

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=False)


class _OfflineGeminiStub:
    """Replaces GeminiChat inside preflight suggest-route so granted-access
    tests get the deterministic offline fallback (HTTP 200) instead of live
    AI network calls."""

    last_notice = "offline"

    def __init__(self, *args, **kwargs):
        pass

    def chat(self, prompt):
        raise RuntimeError("offline test stub")


import backend.api.preflight_api as _preflight_api  # noqa: E402
_preflight_api.GeminiChat = _OfflineGeminiStub

ADMIN_EMAIL = "subadmin@test.com"
ADMIN_PASS = "sub-admin-pass-123"
WEBHOOK_SECRET = "whsec_test_dummy_secret"

_saved = {}


def _patch(name, value):
    _saved[name] = getattr(config, name)
    setattr(config, name, value)


def _restore_all():
    for name, value in _saved.items():
        setattr(config, name, value)
    _saved.clear()
    from backend.api import billing
    billing._price_cache["plans"] = None
    billing._price_cache["at"] = 0.0


def _seed_admin():
    session = SessionLocal()
    try:
        existing = session.query(AdminUser).filter_by(email=ADMIN_EMAIL).first()
        if existing is None:
            a = AdminUser(email=ADMIN_EMAIL, name="Sub Admin", hashed_password=_hash(ADMIN_PASS))
            session.add(a)
            session.commit()
            return a.id
        return existing.id
    finally:
        session.close()


def _admin_token():
    r = client.post("/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _make_student(email, name="Sub Student", approve=True, role="student"):
    """Invite -> signup -> (approve) -> login. Returns (student_pk, token|None)."""
    admin_token = _admin_token()
    r = client.post("/admin/invites", json={"email": email, "role": role},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, f"Invite failed: {r.status_code} {r.text}"
    code = r.json()["invite_code"]
    r = client.post(f"/auth/{role}/signup", json={
        "name": name, "email": email, "password": "password123", "invite_code": code,
    })
    assert r.status_code == 201, f"Signup failed: {r.status_code} {r.text}"
    session = SessionLocal()
    try:
        model = Student if role == "student" else Instructor
        row = session.query(model).filter_by(email=email).first()
        pk = row.id
    finally:
        session.close()
    if approve:
        client.post("/admin/approve", json={"user_id": pk, "user_type": role},
                    headers={"Authorization": f"Bearer {admin_token}"})
        r = client.post(f"/auth/{role}/login", json={"email": email, "password": "password123"})
        assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
        return pk, r.json()["access_token"]
    return pk, None


def _set_subscription(student_pk, status, *, trial_days=None, period_end_in_days=None,
                      sub_id=None, price_id="price_test_monthly", cancel_at_period_end=False):
    session = SessionLocal()
    try:
        sub = session.query(Subscription).filter_by(student_id=student_pk).first()
        if sub is None:
            sub = Subscription(
                student_id=student_pk,
                stripe_subscription_id=sub_id or f"sub_test_{student_pk}_{int(time.time()*1000)}",
                stripe_customer_id=f"cus_test_{student_pk}",
                status=status,
            )
            session.add(sub)
        sub.status = status
        sub.price_id = price_id
        sub.cancel_at_period_end = cancel_at_period_end
        now = datetime.now(timezone.utc)
        sub.trial_end = now + timedelta(days=trial_days) if trial_days is not None else None
        sub.current_period_start = now if period_end_in_days is not None else None
        sub.current_period_end = now + timedelta(days=period_end_in_days) if period_end_in_days is not None else None
        session.commit()
        sub_pk = sub.id
    finally:
        session.close()
    return sub_pk


def _suggest(token):
    """Gated probe endpoint: 403 = blocked; 200 = access granted (offline fallback)."""
    r = client.post("/student/preflight/suggest-route",
                    json={"departure": "KJFK", "destination": "KBOS"},
                    headers={"Authorization": f"Bearer {token}"})
    return r


def _sign(payload: bytes, secret: str = WEBHOOK_SECRET, ts: int | None = None) -> str:
    ts = ts or int(time.time())
    mac = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={mac}"


def _post_event(event: dict, secret: str | None = None):
    payload = json.dumps(event).encode()
    return client.post(
        "/webhooks/stripe",
        content=payload,
        headers={"stripe-signature": _sign(payload, secret or WEBHOOK_SECRET),
                 "Content-Type": "application/json"},
    )


def _sub_event(event_id, student_pk, status="trialing", trial_days=7, sub_id="sub_evt_1",
               customer="cus_evt_1", period_days=30, canceled=False):
    now = datetime.now(timezone.utc)
    obj = {
        "id": sub_id,
        "customer": customer,
        "status": status,
        "cancel_at_period_end": False,
        "trial_end": int((now + timedelta(days=trial_days)).timestamp()),
        "current_period_start": int(now.timestamp()),
        "current_period_end": int((now + timedelta(days=period_days)).timestamp()),
        "canceled_at": int(now.timestamp()) if canceled else None,
        "metadata": {"student_id": str(student_pk)},
        "items": {"data": [{"price": {"id": "price_test_monthly"}}]},
    }
    return {
        "id": event_id,
        "type": "customer.subscription.deleted" if status == "canceled" else "customer.subscription.created",
        "data": {"object": obj},
    }


def _cleanup():
    rate_limiter.reset()
    session = SessionLocal()
    try:
        session.query(StripeEvent).delete()
        student_ids = [row.id for row in session.query(Student).filter(Student.email.like("%@example.com")).all()]
        if student_ids:
            session.query(Subscription).filter(Subscription.student_id.in_(student_ids)).delete(synchronize_session=False)
        session.query(Student).filter(Student.email.like("%@example.com")).delete()
        session.query(Instructor).filter(Instructor.email.like("%@example.com")).delete()
        session.query(Invite).filter(Invite.email.like("%@example.com")).delete()
        session.commit()
    finally:
        session.close()


# --- Tests ------------------------------------------------------------------


def test_admin_only_access():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    student_pk, student_token = _make_student("adminlock@example.com")
    _, instructor_token = _make_student("adminlockins@example.com", role="instructor")

    for path in ("/admin/stats", "/admin/subscriptions", "/admin/system-health"):
        r = client.get(path, headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 403, f"Student should be 403 on {path}: {r.status_code}"
        r = client.get(path, headers={"Authorization": f"Bearer {instructor_token}"})
        assert r.status_code == 403, f"Instructor should be 403 on {path}: {r.status_code}"
        r = client.get(path, headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, f"Admin should be 200 on {path}: {r.status_code} {r.text}"

    r = client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "grant"},
                    headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 403, "Student must not grant beta via admin API"
    r = client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "grant"},
                    headers={"Authorization": f"Bearer {instructor_token}"})
    assert r.status_code == 403, "Instructor must not grant beta via admin API"
    print("PASS: admin endpoints admin-only (students/instructors rejected)")


def test_student_cannot_self_grant():
    _seed_admin()
    _cleanup()
    student_pk, student_token = _make_student("selfgrant@example.com")
    r = client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "grant"},
                    headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 403
    r = client.post("/admin/stats", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code in (403, 405)
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(id=student_pk).first()
        assert student.is_beta_tester is False, "Student must not be able to self-grant beta"
    finally:
        session.close()
    print("PASS: student cannot grant self admin privileges or beta access")


def test_beta_grant_revoke_controls_access():
    _seed_admin()
    _cleanup()
    _patch("SUBSCRIPTION_ENFORCE", "on")
    try:
        admin_token = _admin_token()
        student_pk, student_token = _make_student("betauser@example.com")

        r = _suggest(student_token)
        assert r.status_code == 403 and "subscription" in r.json()["detail"].lower(), \
            f"No subscription -> paid feature must be denied: {r.status_code} {r.text}"

        r = client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "grant"},
                        headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200 and r.json()["granted"] is True, r.text

        r = _suggest(student_token)
        assert r.status_code == 200, f"Beta tester must access paid features: {r.status_code} {r.text}"

        r = client.post("/billing/status", headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["has_access"] is True and data["access_reason"] == "beta" and data["is_beta_tester"] is True

        # Beta + canceled subscription still has access (beta never expires with trial).
        _set_subscription(student_pk, "canceled")
        r = _suggest(student_token)
        assert r.status_code == 200, "Beta entitlement must survive subscription cancellation"

        # Revoke -> normal subscription requirement returns.
        r = client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "revoke"},
                        headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200 and r.json()["granted"] is False
        r = _suggest(student_token)
        assert r.status_code == 403, "Revoked beta without valid subscription must lose access"

        r = client.get("/admin/audit-log", headers={"Authorization": f"Bearer {admin_token}"})
        actions = [a["action"] for a in r.json()]
        assert "beta_grant" in actions and "beta_revoke" in actions, actions
    finally:
        _restore_all()
    print("PASS: beta grant/revoke toggles paid access (revocation restores subscription requirement)")


def test_enforcement_mode():
    _seed_admin()
    _cleanup()
    _, student_token = _make_student("enforce@example.com")
    try:
        _patch("SUBSCRIPTION_ENFORCE", "auto")  # development -> not enforced
        _patch("ENVIRONMENT", "development")
        r = _suggest(student_token)
        assert r.status_code == 200, "auto+development must not enforce"
        _patch("ENVIRONMENT", "staging")
        r = _suggest(student_token)
        assert r.status_code == 403, "auto+staging must enforce"
        _patch("SUBSCRIPTION_ENFORCE", "off")
        r = _suggest(student_token)
        assert r.status_code == 200, "off must never enforce"

        # Explicit boolean-ish "false" must also disable enforcement completely,
        # even when the environment would otherwise enforce.
        _patch("SUBSCRIPTION_ENFORCE", "false")
        r = _suggest(student_token)
        assert r.status_code == 200, "'false' must disable enforcement even in staging"
    finally:
        _restore_all()
    print("PASS: enforcement modes on/off/auto/'false' respect ENVIRONMENT")


def test_subscription_states():
    _seed_admin()
    _cleanup()
    _patch("SUBSCRIPTION_ENFORCE", "on")
    try:
        student_pk, student_token = _make_student("substates@example.com")

        _set_subscription(student_pk, "trialing", trial_days=7, period_end_in_days=30)
        r = _suggest(student_token)
        assert r.status_code == 200, "Trialing subscription must grant access"
        r = client.post("/billing/status", headers={"Authorization": f"Bearer {student_token}"})
        assert r.json()["access_reason"] == "trial" and r.json()["subscription"]["trial_end"]

        _set_subscription(student_pk, "active", trial_days=None, period_end_in_days=30)
        r = _suggest(student_token)
        assert r.status_code == 200, "Active subscription must grant access"
        assert client.post("/billing/status", headers={"Authorization": f"Bearer {student_token}"}).json()["access_reason"] == "subscription"

        _set_subscription(student_pk, "canceled")
        r = _suggest(student_token)
        assert r.status_code == 403 and "ended" in r.json()["detail"].lower(), r.text

        _set_subscription(student_pk, "past_due")
        r = _suggest(student_token)
        assert r.status_code == 403 and "payment failed" in r.json()["detail"].lower(), r.text

        # Stale safety net: status active but period already past.
        _set_subscription(student_pk, "active", period_end_in_days=-1)
        r = _suggest(student_token)
        assert r.status_code == 403, "Active status with past period end must be denied"

        # Stale trial: trialing but trial_end already past (missed webhook).
        _set_subscription(student_pk, "trialing", trial_days=-1, period_end_in_days=30)
        r = _suggest(student_token)
        assert r.status_code == 403, "Trialing with past trial_end must be denied"

        print_detail = client.post("/billing/status", headers={"Authorization": f"Bearer {student_token}"}).json()
        assert print_detail["has_access"] is False and print_detail["blocked_reason"]
    finally:
        _restore_all()
    print("PASS: trialing/active grant; canceled/past_due/expired denied with clear messages")


def test_webhook_signature_and_idempotency():
    _seed_admin()
    _cleanup()
    _patch("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    try:
        student_pk, _ = _make_student("hookuser@example.com")

        # Invalid signature -> 400, nothing persisted.
        payload = json.dumps(_sub_event("evt_bad", student_pk)).encode()
        r = client.post("/webhooks/stripe", content=payload,
                        headers={"stripe-signature": "t=1,v1=deadbeef", "Content-Type": "application/json"})
        assert r.status_code == 400, f"Invalid signature must be rejected: {r.status_code}"

        # Valid signature -> processed, subscription persisted.
        r = _post_event(_sub_event("evt_ok_1", student_pk))
        assert r.status_code == 200 and r.json()["received"] is True, r.text
        session = SessionLocal()
        try:
            sub = session.query(Subscription).filter_by(student_id=student_pk).first()
            assert sub is not None and sub.status == "trialing", "Webhook must persist trialing subscription"
            assert sub.trial_end is not None
            assert session.query(StripeEvent).filter_by(event_id="evt_ok_1").count() == 1
        finally:
            session.close()

        # Duplicate delivery (same event id) -> idempotent, no second row.
        r = _post_event(_sub_event("evt_ok_1", student_pk))
        assert r.status_code == 200 and r.json().get("duplicate") is True, r.text
        session = SessionLocal()
        try:
            assert session.query(Subscription).filter_by(student_id=student_pk).count() == 1
            assert session.query(StripeEvent).filter_by(event_id="evt_ok_1").count() == 1
        finally:
            session.close()

        # invoice.payment_failed -> past_due.
        fail_event = {"id": "evt_fail_1", "type": "invoice.payment_failed",
                      "data": {"object": {"subscription": "sub_evt_1", "customer": "cus_evt_1"}}}
        r = _post_event(fail_event)
        assert r.status_code == 200, r.text
        session = SessionLocal()
        try:
            sub = session.query(Subscription).filter_by(stripe_subscription_id="sub_evt_1").first()
            assert sub.status == "past_due", f"payment_failed must mark past_due: {sub.status}"
        finally:
            session.close()

        # Canceled during trial -> canceled + ended_during_trial (no charge semantics).
        cancel_event = _sub_event("evt_cancel_1", student_pk, status="canceled", sub_id="sub_evt_1", canceled=True)
        r = _post_event(cancel_event)
        assert r.status_code == 200, r.text
        session = SessionLocal()
        try:
            sub = session.query(Subscription).filter_by(stripe_subscription_id="sub_evt_1").first()
            assert sub.status == "canceled"
            assert sub.ended_during_trial is True, "Trial cancellation must be recorded as ended_during_trial"
        finally:
            session.close()

        # checkout.session.completed links Stripe customer to a student (fresh
        # account with no prior customer link).
        fresh_pk, _ = _make_student("hookcheckout@example.com")
        checkout_event = {"id": "evt_cs_1", "type": "checkout.session.completed",
                          "data": {"object": {"id": "cs_test_1", "client_reference_id": None,
                                              "customer": "cus_new_1",
                                              "metadata": {"student_id": str(fresh_pk)}}}}
        r = _post_event(checkout_event)
        assert r.status_code == 200, r.text
        session = SessionLocal()
        try:
            student = session.query(Student).filter_by(id=fresh_pk).first()
            assert student.stripe_customer_id == "cus_new_1"
        finally:
            session.close()

        # Missing webhook secret configuration -> clear 503, no crash.
        _patch("STRIPE_WEBHOOK_SECRET", None)
        r = _post_event(_sub_event("evt_no_secret", student_pk))
        assert r.status_code == 503 and "not configured" in r.json()["detail"].lower(), r.text
    finally:
        _restore_all()
    print("PASS: webhook signature verified, duplicates idempotent, events applied correctly")


def test_checkout_configuration_guards():
    _seed_admin()
    _cleanup()
    _, student_token = _make_student("checkout@example.com")
    try:
        # Unconfigured -> setup message, never a crash.
        _patch("STRIPE_SECRET_KEY", None)
        _patch("STRIPE_PUBLISHABLE_KEY", None)
        r = client.get("/billing/config")
        assert r.status_code == 200 and r.json()["configured"] is False and r.json()["setup_message"], r.text
        assert r.json()["trial_days"] == config.STRIPE_TRIAL_DAYS
        r = client.post("/billing/checkout", json={"price_key": "monthly"},
                        headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 403 and "not configured" in r.json()["detail"].lower(), r.text

        # Live (sk_live_) key rejected without approval.
        _patch("STRIPE_SECRET_KEY", "sk_live_should_not_work")
        _patch("STRIPE_PUBLISHABLE_KEY", "pk_live_should_not_work")
        _patch("STRIPE_ALLOW_LIVE", False)
        r = client.post("/billing/checkout", json={"price_key": "monthly"},
                        headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 403 and "test-mode" in r.json()["detail"].lower(), r.text

        # Test key but no price configured -> clear plan message (no network call).
        _patch("STRIPE_SECRET_KEY", "sk_test_dummy")
        _patch("STRIPE_PUBLISHABLE_KEY", "pk_test_dummy")
        _patch("STRIPE_PRICE_ID_MONTHLY", None)
        r = client.post("/billing/checkout", json={"price_key": "monthly"},
                        headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 403 and "not configured" in r.json()["detail"].lower(), r.text

        # Beta accounts never see a checkout prompt.
        _patch("STRIPE_PRICE_ID_MONTHLY", "price_test_monthly")
        admin_token = _admin_token()
        session = SessionLocal()
        try:
            student_pk = session.query(Student).filter_by(email="checkout@example.com").first().id
        finally:
            session.close()
        client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "grant"},
                    headers={"Authorization": f"Bearer {admin_token}"})
        r = client.post("/billing/checkout", json={"price_key": "monthly"},
                        headers={"Authorization": f"Bearer {student_token}"})
        assert r.status_code == 400 and "beta" in r.json()["detail"].lower(), r.text
    finally:
        _restore_all()
    print("PASS: checkout guarded by configuration, test-mode and beta entitlement")


def test_checkout_at_signup_validation():
    _seed_admin()
    _cleanup()
    try:
        _patch("STRIPE_SECRET_KEY", "sk_test_dummy")
        _patch("STRIPE_PUBLISHABLE_KEY", "pk_test_dummy")
        _patch("STRIPE_PRICE_ID_MONTHLY", "price_test_monthly")

        admin_token = _admin_token()
        r = client.post("/admin/invites", json={"email": "trial@example.com", "role": "student"},
                        headers={"Authorization": f"Bearer {admin_token}"})
        code = r.json()["invite_code"]
        r = client.post("/auth/student/signup", json={
            "name": "Trial", "email": "trial@example.com",
            "password": "password123", "invite_code": code,
        })
        assert r.status_code == 201
        session = SessionLocal()
        try:
            _row = session.query(Student).filter_by(email="trial@example.com").first()
            student_pk = _row.id
            student_bid = _row.student_id
        finally:
            session.close()

        # Unknown student -> 404 (before any Stripe call).
        r = client.post("/billing/checkout-at-signup",
                        json={"student_id": "STU-9999", "invite_code": code, "price_key": "monthly"})
        assert r.status_code == 404, r.text

        # Invite that did not create this account -> 400.
        r = client.post("/billing/checkout-at-signup",
                        json={"student_id": student_bid, "invite_code": "some-other-invite-code",
                              "price_key": "monthly"})
        assert r.status_code == 400, r.text

        # Correct pairing passes validation (would hit Stripe next — network —
        # so we stop here; full checkout is a documented manual test-mode step).
        from backend.api import billing as billing_mod
        original = billing_mod._create_checkout_session
        called = {}

        def fake_create(student, price_id, session):
            called.update({"price_id": price_id, "student": student.student_id})
            return {"url": "https://checkout.stripe.com/test/fake", "trial_days": config.STRIPE_TRIAL_DAYS,
                    "estimated_first_billing_date": billing_mod._estimated_first_billing()}

        billing_mod._create_checkout_session = fake_create
        try:
            r = client.post("/billing/checkout-at-signup",
                            json={"student_id": student_bid, "invite_code": code, "price_key": "monthly"})
            assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.com"), r.text
            assert r.json()["trial_days"] == config.STRIPE_TRIAL_DAYS
            assert r.json()["estimated_first_billing_date"]
            assert called["price_id"] == "price_test_monthly"
        finally:
            billing_mod._create_checkout_session = original
    finally:
        _restore_all()
    print("PASS: signup checkout validated by invite pairing, testable offline")


def test_admin_stats_and_users_fields():
    _seed_admin()
    _cleanup()
    admin_token = _admin_token()
    student_pk, _ = _make_student("statsuser@example.com")
    client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "grant"},
                headers={"Authorization": f"Bearer {admin_token}"})
    _set_subscription(student_pk, "active", period_end_in_days=30)

    r = client.get("/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    stats = r.json()
    for key in ("total_users", "active_subscribers", "free_beta_testers", "subscription_status",
                "student_account_status", "pending_invites"):
        assert key in stats, f"stats missing {key}"
    assert stats["total_students"] >= 1
    assert stats["active_subscribers"] >= 1
    assert stats["free_beta_testers"] >= 1
    assert stats["subscription_status"].get("active") >= 1

    r = client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    student_rows = [u for u in r.json()["students"] if u["id"] == student_pk]
    assert student_rows, "student missing from /admin/users"
    row = student_rows[0]
    for key in ("is_beta_tester", "subscription_status", "subscription_valid", "has_access"):
        assert key in row, f"/admin/users missing {key}"
    assert row["is_beta_tester"] is True and row["has_access"] is True

    r = client.get("/admin/subscriptions", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200 and len(r.json()) >= 1
    sub_row = r.json()[0]
    assert sub_row["status"] == "active" and sub_row["student"]["email"]

    r = client.get("/admin/system-health", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    health = r.json()
    assert health["database"]["connected"] is True
    assert set(health["ai_providers"]) == {"groq", "gemini", "tavily", "huggingface", "ollama"}
    # Never leak key material — values must be booleans.
    assert all(isinstance(v, bool) for v in health["ai_providers"].values())
    assert isinstance(health["stripe"]["test_mode"], bool)
    print("PASS: admin stats/users/subscriptions/system-health payloads complete and leak-free")


def test_beta_requires_no_payment_details():
    _seed_admin()
    _cleanup()
    _patch("SUBSCRIPTION_ENFORCE", "on")
    _patch("STRIPE_SECRET_KEY", None)
    _patch("STRIPE_PUBLISHABLE_KEY", None)
    try:
        admin_token = _admin_token()
        student_pk, student_token = _make_student("nopay@example.com")
        r = _suggest(student_token)
        assert r.status_code == 403
        client.post("/admin/beta", json={"user_id": student_pk, "user_type": "student", "action": "grant"},
                    headers={"Authorization": f"Bearer {admin_token}"})
        # Stripe is unconfigured — beta must still work without any payment setup.
        r = _suggest(student_token)
        assert r.status_code == 200, "Beta must work even when Stripe is not configured"
        r = client.post("/billing/status", headers={"Authorization": f"Bearer {student_token}"})
        assert r.json()["has_access"] is True and r.json()["is_beta_tester"] is True
    finally:
        _restore_all()
    print("PASS: beta entitlement needs no payment details and ignores Stripe configuration")


if __name__ == "__main__":
    _cleanup()
    test_admin_only_access()
    test_student_cannot_self_grant()
    test_beta_grant_revoke_controls_access()
    test_enforcement_mode()
    test_subscription_states()
    test_webhook_signature_and_idempotency()
    test_checkout_configuration_guards()
    test_checkout_at_signup_validation()
    test_admin_stats_and_users_fields()
    test_beta_requires_no_payment_details()
    _cleanup()
    print("\nAll subscription/beta/admin/webhook tests passed.")
