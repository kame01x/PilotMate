"""Rate limiter tests: email-keyed auth limits, AI endpoint coverage, memory eviction.

Env vars must be set BEFORE importing backend so config picks them up.
"""
import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ["RATE_LIMIT_AI_REQUESTS"] = "2"
os.environ["RATE_LIMIT_AI_WINDOW"] = "3600"
os.environ["RATE_LIMIT_AUTH_REQUESTS"] = "3"
os.environ["RATE_LIMIT_AUTH_WINDOW"] = "60"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.api.auth import _hash
from backend.api.main import app
from backend.api.ratelimit import RateLimiter, rate_limiter
from backend.database import Base, SessionLocal, engine
from backend.models import Instructor, Student

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=False)


def _cleanup():
    session = SessionLocal()
    try:
        session.query(Student).delete()
        session.query(Instructor).delete()
        session.commit()
        session.close()
    except Exception:
        session.close()
        raise


def _seed():
    _cleanup()
    session = SessionLocal()
    try:
        s = Student(student_id="STU-RL01", name="RL", email="rl@example.com",
                    hashed_password=_hash("password123"), account_status="active")
        ins = Instructor(instructor_id="INS-RL01", name="RLIns", email="rlins@example.com",
                         hashed_password=_hash("password123"), account_status="active")
        session.add_all([s, ins])
        session.commit()
        session.close()
    except Exception:
        session.close()
        raise


def _login(email, password="password123"):
    r = client.post("/auth/student/login", json={"email": email, "password": password})
    if r.status_code != 200:
        r = client.post("/auth/instructor/login", json={"email": email, "password": password})
    return r.json()["access_token"] if r.status_code == 200 else None


def test_auth_rate_limit_keyed_by_email():
    rate_limiter.reset()
    r = None
    for _ in range(10):
        r = client.post("/auth/student/login", json={"email": "brute@example.com", "password": "wrong"})
        if r.status_code == 429:
            break
    assert r.status_code == 429, f"Expected 429 after exhausting auth limit, got {r.status_code}"
    assert "Retry-After" in r.headers, "429 response should include Retry-After header"

    r = client.post("/auth/student/login", json={"email": "innocent@example.com", "password": "wrong"})
    assert r.status_code == 401, f"Other email should not be blocked, got {r.status_code}"

    rate_limiter.reset()
    print("PASS: auth rate limit keyed by email (other accounts unaffected)")


def test_ai_rate_limit_on_student_endpoints():
    rate_limiter.reset()
    _seed()
    token = _login("rl@example.com")
    assert token is not None, "Seeded student should login"
    h = {"Authorization": f"Bearer {token}"}

    class FakeRouterAgent:
        def __init__(self):
            self._classifier = SimpleNamespace(last_notice=None)

        def chat(self, msg):
            return {"response": "ok", "routed_to": None}

    with patch("backend.api.student.get_router_agent", return_value=FakeRouterAgent()):
        r = None
        for _ in range(10):
            r = client.post("/student/chat", json={"message": "hi"}, headers=h)
            if r.status_code == 429:
                break
        assert r.status_code == 429, f"chat should hit 429, got {r.status_code}"
        assert "Retry-After" in r.headers, "429 should include Retry-After"

        r = client.post("/student/preflight/stream", json={
            "message": "briefing", "departure": "KSQL", "destination": "KOAK",
            "aircraft_type": "C172",
        }, headers=h)
        assert r.status_code == 429, f"stream should be blocked after limit, got {r.status_code}"

        r = client.post("/student/preflight/suggest-route", json={"departure": "KSQL"}, headers=h)
        assert r.status_code == 429, f"suggest-route should be blocked, got {r.status_code}"

    rate_limiter.reset()
    print("PASS: AI rate limits on chat, stream, suggest-route (shared per-user budget)")


def test_ai_rate_limit_on_instructor_preflight():
    rate_limiter.reset()
    _seed()
    token = _login("rlins@example.com")
    assert token is not None, "Seeded instructor should login"
    h = {"Authorization": f"Bearer {token}"}

    with patch("backend.api.instructor.instructor_run_preflight", return_value="ok"):
        r = None
        for _ in range(10):
            r = client.post("/instructor/preflight", json={
                "student_id": "STU-RL01", "message": "briefing please",
            }, headers=h)
            if r.status_code == 429:
                break
        assert r.status_code == 429, f"instructor preflight should hit 429, got {r.status_code}"
        assert "Retry-After" in r.headers, "429 should include Retry-After"

    rate_limiter.reset()
    print("PASS: AI rate limit on /instructor/preflight")


def test_limiter_eviction_bounds_memory():
    limiter = RateLimiter()

    async def fill():
        for i in range(15_000):
            await limiter.is_allowed(f"key-{i}", 100, 3600)

    asyncio.run(fill())
    assert len(limiter._windows) <= RateLimiter.MAX_KEYS, (
        f"Key count {len(limiter._windows)} exceeds MAX_KEYS {RateLimiter.MAX_KEYS}"
    )

    limiter.reset()
    print("PASS: limiter evicts keys to stay under MAX_KEYS")


def test_limiter_reset_clears_state():
    limiter = RateLimiter()

    async def hit():
        return await limiter.is_allowed("k", 1, 60)

    allowed, _ = asyncio.run(hit())
    assert allowed, "First request should be allowed"
    allowed, _retry = asyncio.run(hit())
    assert not allowed, "Second request should be blocked (limit=1)"

    limiter.reset()
    allowed, _ = asyncio.run(hit())
    assert allowed, "After reset, key should be allowed again"
    print("PASS: reset() clears rate-limit windows")


if __name__ == "__main__":
    test_auth_rate_limit_keyed_by_email()
    test_ai_rate_limit_on_student_endpoints()
    test_ai_rate_limit_on_instructor_preflight()
    test_limiter_eviction_bounds_memory()
    test_limiter_reset_clears_state()
    print("\nAll rate limit tests passed.")
