"""Pre-flight persistence tests: a successful pre-flight briefing must persist a
durable Flight (+ PreflightPackage) for the authenticated student, and that saved
flight must then be retrievable through the same endpoints the Dashboard and the
Debriefing flight selector use (GET /student/flights).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from backend.api import preflight_api
from backend.api.auth import _hash
from backend.api.main import app
from backend.api.ratelimit import rate_limiter
from backend.database import SessionLocal, engine, Base
from backend.models import (
    AdminUser,
    AuditLog,
    Debrief,
    Flight,
    Instructor,
    Invite,
    PreflightPackage,
    Student,
)
from backend.preflight.contracts import (
    BriefingRequest,
    BriefingResult,
    BriefingSection,
    BriefingStatus,
    FlightContext,
    new_generation_id,
    SectionStatus,
)

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=False)

ADMIN_EMAIL = "admin@test.com"
ADMIN_PASS = "admin-pass-123"
STUDENT_EMAIL = "preflight-persist@example.com"
STUDENT_PASS = "password123"


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


def _student_token():
    r = client.post("/auth/student/signup", json={
        "name": "Preflight Persist", "email": STUDENT_EMAIL, "password": STUDENT_PASS,
    })
    assert r.status_code == 201, f"Student signup failed: {r.status_code} {r.text}"
    r = client.post("/auth/student/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASS})
    assert r.status_code == 200, f"Student login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _cleanup():
    rate_limiter.reset()
    session = SessionLocal()
    try:
        session.query(Debrief).delete()
        session.query(PreflightPackage).delete()
        session.query(Flight).delete()
        session.query(Student).filter(Student.email.like("%preflight-persist%")).delete()
        session.query(Instructor).filter(Instructor.email.like("%preflight-persist%")).delete()
        session.query(Invite).filter(Invite.email.like("%preflight-persist%")).delete()
        session.query(AuditLog).delete()
        session.commit()
    finally:
        session.close()


async def _fake_run_briefing_json(request_dict, include_videos: bool = True) -> BriefingResult:
    ctx = FlightContext.from_request(BriefingRequest(**request_dict), new_generation_id())
    result = BriefingResult(
        generation_id=ctx.generation_id,
        status=BriefingStatus.COMPLETE,
        context=ctx,
        sections=[
            BriefingSection(
                section_id="flight_overview",
                title="Flight Overview",
                status=SectionStatus.OK,
                blocks=[{"type": "paragraph", "text": "Fake briefing for tests."}],
            )
        ],
    )
    return result


def _fake_stream(request_dict, include_videos: bool = True):
    async def gen():
        yield 'event: generation_started\ndata: {"type": "generation_started", "generation_id": "pf-test-gen"}\n\n'
        yield (
            'event: generation_completed\n'
            'data: {"type": "generation_completed", "generation_id": "pf-test-gen", '
            '"status": "complete", "counts": {"ok": 1, "unavailable": 0, "failed": 0}}\n\n'
        )
    return gen


def _briefing_body():
    return {
        "message": "I am starting a flight: departure KSQL, destination KLAX, aircraft Cessna 172, exercise take-off and landing, rules VFR.",
        "departure": "KSQL",
        "destination": "KLAX",
        "route": "KSQL-KLAX",
        "aircraft_type": "Cessna 172",
        "aircraft_registration": "N12345",
        "exercise": "take-off and landing",
        "rules": "VFR",
        "flight_date": "2026-10-29",
        "departure_time": "08:00",
        "flight_period": "day",
        "departure_runway_surface": "concrete",
        "departure_controlled": True,
    }


def test_preflight_generation_does_not_persist():
    _seed_admin()
    _cleanup()
    token = _student_token()
    headers = {"Authorization": f"Bearer {token}"}

    original_run_briefing_json = preflight_api.run_briefing_json
    original_stream_briefing = preflight_api.stream_briefing
    preflight_api.run_briefing_json = _fake_run_briefing_json
    preflight_api.stream_briefing = _fake_stream
    try:
        r = client.post("/student/preflight", json=_briefing_body(), headers=headers)
        assert r.status_code == 200, f"Preflight should succeed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("status") == "complete"
        assert "flight" not in data, f"Generation must not persist or return a flight: {data}"
    finally:
        preflight_api.run_briefing_json = original_run_briefing_json
        preflight_api.stream_briefing = original_stream_briefing


def test_preflight_save_creates_exactly_one_flight():
    _seed_admin()
    _cleanup()
    token = _student_token()
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/student/preflight/save", json={"generation_id": "pf-save-gen-1", "briefing": _briefing_body()}, headers=headers)
    assert r.status_code == 200, f"Save should succeed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("saved") is True, f"Save must report success: {data}"
    flight = data.get("flight") or {}
    assert flight.get("id") is not None, f"Save response must carry the real saved flight id: {data}"
    saved_flight_id = flight["id"]

    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email=STUDENT_EMAIL).first()
        assert student is not None
        db_flight = session.query(Flight).filter_by(id=saved_flight_id, student_id=student.id).first()
        assert db_flight is not None, "Save must persist a Flight row"
        assert db_flight.departure_airport == "KSQL"
        assert db_flight.destination_airport == "KLAX"
        assert db_flight.route == "KSQL-KLAX"
        assert db_flight.aircraft_type == "Cessna 172"
        assert db_flight.exercise_type == "take-off and landing"
        assert db_flight.flight_rules == "VFR"
        assert db_flight.runway_surface == "concrete"
        assert db_flight.controlled is True
        if db_flight.date is not None:
            assert db_flight.date.year == 2026
        pkg = session.query(PreflightPackage).filter_by(flight_id=db_flight.id).first()
        assert pkg is not None, "Save must persist a PreflightPackage"
        flight_count = session.query(Flight).count()
    finally:
        session.close()
    assert flight_count == 1, f"Save must create exactly one flight, got {flight_count}"

    r = client.get("/student/flights", headers=headers)
    assert r.status_code == 200, f"Dashboard flights endpoint failed: {r.status_code} {r.text}"
    flights = r.json()
    assert isinstance(flights, list)
    assert any(f.get("id") == saved_flight_id for f in flights), f"Saved flight missing from list: {flights}"

    # Idempotent save for the same generation must not create a duplicate Flight.
    r2 = client.post("/student/preflight/save", json={"generation_id": "pf-save-gen-1", "briefing": _briefing_body()}, headers=headers)
    assert r2.status_code == 200, f"Repeat save should succeed: {r2.status_code} {r2.text}"
    assert r2.json()["flight"]["id"] == saved_flight_id
    print("PASS: explicit save creates exactly one flight returned with the real db id, then stays idempotent")


def test_preflight_save_failure_returns_error():
    _seed_admin()
    _cleanup()
    token = _student_token()
    headers = {"Authorization": f"Bearer {token}"}

    def _boom(student_id, details, date=None):
        raise RuntimeError("simulated save failure")

    original_create_flight = preflight_api.create_flight
    preflight_api.create_flight = _boom
    try:
        r = client.post("/student/preflight/save", json={"generation_id": "pf-save-gen-2", "briefing": _briefing_body()}, headers=headers)
        assert r.status_code == 502, f"Failed save must not report success: {r.status_code} {r.text}"
        assert "flight" not in r.json()
    finally:
        preflight_api.create_flight = original_create_flight
    print("PASS: failed save does not produce a false success response")



def test_student_cannot_read_another_students_flight():
    _seed_admin()
    _cleanup()
    student_b_token = _student_token()

    r = client.get("/student/flights", headers={"Authorization": f"Bearer {student_b_token}"})
    assert r.status_code == 200
    assert r.json() == []

    r = client.get("/student/debriefs/999999", headers={"Authorization": f"Bearer {student_b_token}"})
    assert r.status_code == 404, f"Student B must not read student A's debrief: {r.status_code}"
    print("PASS: student cannot read another student's debrief")


if __name__ == "__main__":
    _cleanup()
    _seed_admin()
    test_preflight_generation_does_not_persist()
    test_preflight_save_creates_exactly_one_flight()
    test_preflight_save_failure_returns_error()
    test_student_cannot_read_another_students_flight()
    print("\nAll pre-flight persistence tests passed.")

