"""Aircraft weight schedules + mass & balance calculation API (Phase 21B).

GET  /student/aircraft/{registration}        fetch a stored weight schedule
PUT  /student/aircraft/{registration}        create/update a weight schedule
POST /student/mass-balance/calculate         deterministic calculation (no LLM)

The calculation never invents data: it only reads the stored schedule (with
its recorded source/revision) and the loads sent by the student. Missing data
produces an explicit incomplete/unverifiable state, never a silent default.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.deps import get_current_student
from backend.massbalance import calculate, validate_schedule
from backend.models import Aircraft, Student
from backend.database import SessionLocal

router = APIRouter(prefix="/student", tags=["mass-balance"])


def _norm_registration(registration: str) -> str:
    reg = (registration or "").strip().upper()
    if not reg:
        raise HTTPException(status_code=400, detail="registration is required")
    if len(reg) > 20:
        raise HTTPException(status_code=400, detail="registration is too long (max 20 chars)")
    return reg


def _schedule_payload(ac: Aircraft) -> dict:
    warnings: list[str] = []
    if not (ac.source or "").strip():
        warnings.append(
            "No data source recorded — results will be reported as UNVERIFIABLE until "
            "you record where the figures came from (e.g. weight schedule revision)."
        )
    return {
        "registration": ac.registration,
        "aircraft_type": ac.aircraft_type,
        "schedule": ac.schedule,
        "source": ac.source,
        "revision": ac.revision,
        "verified": ac.verified,
        "updated_at": ac.updated_at.isoformat() if ac.updated_at else None,
        "warnings": warnings,
    }


class ScheduleBody(BaseModel):
    aircraft_type: str | None = None
    schedule: dict
    source: str | None = None
    revision: str | None = None


class LoadInput(BaseModel):
    station_id: str
    mass: float = Field(ge=0)
    mass_unit: str | None = None


class FuelInput(BaseModel):
    station_id: str
    volume: float = Field(ge=0)
    volume_unit: str
    density: float | None = Field(default=None, gt=0)
    density_unit: str | None = None


class TaxiFuelInput(BaseModel):
    """Taxi fuel is not loaded against a schedule station — no station_id."""
    volume: float = Field(ge=0)
    volume_unit: str
    density: float | None = Field(default=None, gt=0)
    density_unit: str | None = None


class CalculateBody(BaseModel):
    registration: str
    loads: list[LoadInput] = Field(default_factory=list)
    fuel: list[FuelInput] = Field(default_factory=list)
    taxi_fuel: TaxiFuelInput | None = None
    endurance_hours: float | None = Field(default=None, ge=0)


@router.get("/aircraft/{registration}")
def get_aircraft(registration: str, student: Student = Depends(get_current_student)):
    reg = _norm_registration(registration)
    db = SessionLocal()
    try:
        ac = db.query(Aircraft).filter(Aircraft.registration == reg).first()
        if ac is None:
            raise HTTPException(status_code=404, detail=f"No weight schedule on file for {reg}")
        if ac.owner_student_id != student.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this aircraft")
        return _schedule_payload(ac)
    finally:
        db.close()


@router.put("/aircraft/{registration}")
def put_aircraft(registration: str, body: ScheduleBody,
                 student: Student = Depends(get_current_student)):
    reg = _norm_registration(registration)
    problems = validate_schedule(body.schedule)
    if problems:
        raise HTTPException(status_code=400, detail="; ".join(problems)[:500])
    db = SessionLocal()
    try:
        ac = db.query(Aircraft).filter(Aircraft.registration == reg).first()
        if ac is None:
            ac = Aircraft(registration=reg, owner_student_id=student.id)
            db.add(ac)
        else:
            if ac.owner_student_id != student.id:
                raise HTTPException(status_code=403, detail="Not authorized to modify this aircraft")
        ac.aircraft_type = (body.aircraft_type or "").strip() or ac.aircraft_type
        ac.schedule = body.schedule
        ac.source = (body.source or "").strip() or None
        ac.revision = (body.revision or "").strip() or None
        db.commit()
        db.refresh(ac)
        return _schedule_payload(ac)
    finally:
        db.close()


@router.post("/mass-balance/calculate")
def calculate_mass_balance(body: CalculateBody, student: Student = Depends(get_current_student)):
    """Deterministic calculation — identical inputs always yield identical outputs."""
    reg = _norm_registration(body.registration)
    db = SessionLocal()
    try:
        ac = db.query(Aircraft).filter(Aircraft.registration == reg).first()
        if ac is not None and ac.owner_student_id != student.id:
            raise HTTPException(status_code=403, detail="Not authorized to use this aircraft")
        result = calculate(
            ac.schedule if ac else None,
            registration=reg,
            source=ac.source if ac else None,
            revision=ac.revision if ac else None,
            verified=bool(ac.verified) if ac else False,
            loads=[ld.model_dump() for ld in body.loads],
            fuel=[f.model_dump() for f in body.fuel],
            taxi_fuel=body.taxi_fuel.model_dump() if body.taxi_fuel else None,
            endurance_hours=body.endurance_hours,
        )
        return result
    finally:
        db.close()
