"""New Pre-flight engine — explicit contracts.

Every operation returns a defined result. Nothing here can produce None
silently: sections carry a status, failures carry machine-readable errors,
and the assembled briefing always has a status.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


def new_generation_id() -> str:
    return f"pf-{uuid4().hex[:12]}"


class SectionStatus(str, Enum):
    OK = "ok"
    UNAVAILABLE = "unavailable"   # source exists but has no data for this request
    FAILED = "failed"              # tool/provider error — explicit, never silently null


class BriefingStatus(str, Enum):
    COMPLETE = "complete"
    PARTIAL = "partial"            # >=1 section failed/unavailable, others valid
    FAILED = "failed"              # could not produce any usable briefing


class Source(BaseModel):
    name: str
    url: str | None = None
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BriefingSection(BaseModel):
    section_id: str
    title: str
    status: SectionStatus
    blocks: list[dict[str, Any]] = Field(default_factory=list)  # structured content blocks
    sources: list[Source] = Field(default_factory=list)
    error: str | None = None
    notice: str | None = None

    @field_validator("blocks", mode="before")
    @classmethod
    def _blocks_never_none(cls, v):
        return v or []


class BriefingRequest(BaseModel):
    """Mirrors the existing frontend payload 1:1 (fields the UI sends today)."""
    message: str
    departure: str
    destination: str | None = None
    route: str | None = None
    aircraft_type: str | None = None
    aircraft_registration: str | None = None
    exercise: str | None = None
    rules: Literal["VFR", "IFR"] = "VFR"
    flight_date: str | None = None
    departure_time: str | None = None
    flight_period: Literal["day", "night", "mixed"] = "day"
    authority: str | None = None
    runway: str | None = None
    fuel: str | None = None
    endurance: str | None = None
    departure_runway_surface: Literal["grass", "concrete"] | None = None
    departure_controlled: bool | None = None
    destination_runway_surface: Literal["grass", "concrete"] | None = None
    destination_controlled: bool | None = None

    @field_validator("departure")
    @classmethod
    def _departure_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("departure airport (ICAO) is required")
        return v.strip().upper()


class FlightContext(BaseModel):
    """Validated, normalized context every specialist receives."""
    generation_id: str
    departure: str
    destination: str | None
    route: str | None
    aircraft_type: str | None
    aircraft_registration: str | None
    exercises: list[str]
    rules: str
    flight_date: str | None
    departure_time: str | None
    flight_period: str
    authority: str | None
    runway: str | None
    fuel: str | None
    endurance: str | None
    dep_surface: str | None
    dep_controlled: bool | None
    dest_surface: str | None
    dest_controlled: bool | None
    submitted_message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @classmethod
    def from_request(cls, req: BriefingRequest, generation_id: str) -> "FlightContext":
        exercises = [e.strip() for e in (req.exercise or "").split(",") if e.strip()]
        return cls(
            generation_id=generation_id,
            departure=req.departure.strip().upper(),
            destination=req.destination.strip().upper() if req.destination else None,
            route=req.route or None,
            aircraft_type=req.aircraft_type or None,
            aircraft_registration=req.aircraft_registration or None,
            exercises=exercises,
            rules=req.rules,
            flight_date=req.flight_date,
            departure_time=req.departure_time,
            flight_period=req.flight_period,
            authority=req.authority,
            runway=req.runway,
            fuel=req.fuel,
            endurance=req.endurance,
            dep_surface=req.departure_runway_surface,
            dep_controlled=req.departure_controlled,
            dest_surface=req.destination_runway_surface,
            dest_controlled=req.destination_controlled,
            submitted_message=req.message,
        )


class BriefingResult(BaseModel):
    """The final assembled briefing. Always present on HTTP 200 — never null."""
    generation_id: str
    status: BriefingStatus
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    context: FlightContext
    sections: list[BriefingSection]
    notice: str | None = None

    def section_map(self) -> dict[str, BriefingSection]:
        return {s.section_id: s for s in self.sections}

    def summary(self) -> dict[str, int]:
        counts = {"ok": 0, "unavailable": 0, "failed": 0}
        for s in self.sections:
            counts[s.status.value] += 1
        return counts


# ---------------------------------------------------------------------------
# Streaming events (SSE `data:` payloads)
# ---------------------------------------------------------------------------

class StreamEvent(BaseModel):
    type: Literal[
        "generation_started",
        "section_started",
        "section_completed",
        "section_unavailable",
        "section_failed",
        "generation_completed",
        "generation_failed",
    ]
    generation_id: str
    section_id: str | None = None
    section: BriefingSection | None = None
    status: BriefingStatus | None = None
    error: str | None = None
    counts: dict[str, int] | None = None

    def to_sse(self) -> str:
        return f"event: {self.type}\ndata: {self.model_dump_json()}\n\n"


VERIFY_NOTICE = (
    "Reference data only — the student/instructor must verify against official "
    "sources (AIP, METAR/TAF provider, NOTAM service, POH/AFM) before any flight."
)
