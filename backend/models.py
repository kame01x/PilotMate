from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    school: Mapped[str | None] = mapped_column(String(200))
    country: Mapped[str | None] = mapped_column(String(100))
    authority: Mapped[str | None] = mapped_column(String(50))
    home_airport: Mapped[str | None] = mapped_column(String(50))
    linked_instructor_id: Mapped[int | None] = mapped_column(
        ForeignKey("instructors.id"), nullable=True
    )
    email: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    linked_instructor: Mapped["Instructor | None"] = relationship(
        "Instructor", back_populates="linked_students"
    )
    flights: Mapped[list["Flight"]] = relationship("Flight", back_populates="student")
    debriefs: Mapped[list["Debrief"]] = relationship("Debrief", back_populates="student")


class Instructor(Base):
    __tablename__ = "instructors"

    id: Mapped[int] = mapped_column(primary_key=True)
    instructor_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    school: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    linked_students: Mapped[list["Student"]] = relationship(
        "Student", back_populates="linked_instructor"
    )


class Flight(Base):
    __tablename__ = "flights"

    id: Mapped[int] = mapped_column(primary_key=True)
    flight_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    departure_airport: Mapped[str] = mapped_column(String(50), nullable=False)
    destination_airport: Mapped[str | None] = mapped_column(String(50))
    route: Mapped[str | None] = mapped_column(String(500))
    aircraft_type: Mapped[str | None] = mapped_column(String(100))
    exercise_type: Mapped[str | None] = mapped_column(String(200))
    runway_surface: Mapped[str | None] = mapped_column(String(20))
    controlled: Mapped[bool | None] = mapped_column(Boolean)
    flight_rules: Mapped[str | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    student: Mapped["Student"] = relationship("Student", back_populates="flights")
    preflight_package: Mapped["PreflightPackage | None"] = relationship(
        "PreflightPackage", back_populates="flight", uselist=False
    )
    debrief: Mapped["Debrief | None"] = relationship(
        "Debrief", back_populates="flight", uselist=False
    )


class PreflightPackage(Base):
    __tablename__ = "preflight_packages"

    id: Mapped[int] = mapped_column(primary_key=True)
    flight_id: Mapped[int] = mapped_column(
        ForeignKey("flights.id"), unique=True, nullable=False
    )
    mass_and_balance: Mapped[dict | list | None] = mapped_column(JSON)
    flight_plan: Mapped[dict | list | None] = mapped_column(JSON)
    metar_taf: Mapped[dict | list | None] = mapped_column(JSON)
    notam_summary: Mapped[dict | list | None] = mapped_column(JSON)
    active_areas: Mapped[dict | list | None] = mapped_column(JSON)
    charts_links: Mapped[dict | list | None] = mapped_column(JSON)
    frequencies: Mapped[dict | list | None] = mapped_column(JSON)
    document_checklist: Mapped[dict | list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    flight: Mapped["Flight"] = relationship(
        "Flight", back_populates="preflight_package"
    )


class Debrief(Base):
    __tablename__ = "debriefs"

    id: Mapped[int] = mapped_column(primary_key=True)
    flight_id: Mapped[int] = mapped_column(
        ForeignKey("flights.id"), unique=True, nullable=False
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False)
    instructor_notes: Mapped[str | None] = mapped_column(Text)
    student_reported_feedback: Mapped[str | None] = mapped_column(Text)
    agent_conversation_log: Mapped[dict | list | None] = mapped_column(JSON)
    identified_weak_points: Mapped[dict | list | None] = mapped_column(JSON)
    coaching_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    flight: Mapped["Flight"] = relationship("Flight", back_populates="debrief")
    student: Mapped["Student"] = relationship("Student", back_populates="debriefs")


class InstructorMessage(Base):
    __tablename__ = "instructor_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    from_id: Mapped[int] = mapped_column(nullable=False)
    from_type: Mapped[str] = mapped_column(String(20), nullable=False)
    to_id: Mapped[int] = mapped_column(nullable=False)
    to_type: Mapped[str] = mapped_column(String(20), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    read_status: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TechnicalLog(Base):
    __tablename__ = "technical_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False)
    flight_id: Mapped[int | None] = mapped_column(ForeignKey("flights.id"), nullable=True)
    topic: Mapped[str] = mapped_column(String(200), nullable=False)
    exchange_type: Mapped[str] = mapped_column(String(20), nullable=False)
    key_points: Mapped[dict | list | None] = mapped_column(JSON)
    authority_caveat: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    student: Mapped["Student"] = relationship("Student")
    flight: Mapped["Flight | None"] = relationship("Flight")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    aircraft_type: Mapped[str | None] = mapped_column(String(100))
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_reference: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str] = mapped_column(String(200), nullable=False)
    currency_notice: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Aircraft(Base):
    """Registration-specific weight schedule for mass & balance (Phase 21B).

    The numeric structure lives in `schedule` (mass/arm units, empty mass and
    arm or moment, limits, loading stations, fuel tanks, optional CG envelope).
    Provenance (`source`, `revision`) is first-class: without it a calculation
    is reported as UNVERIFIABLE, never silently trusted. `verified` marks
    instructor approval; generic or AI-invented values are never stored here.
    """

    __tablename__ = "aircraft"

    id: Mapped[int] = mapped_column(primary_key=True)
    registration: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    aircraft_type: Mapped[str | None] = mapped_column(String(100))
    schedule: Mapped[dict | list | None] = mapped_column(JSON)
    source: Mapped[str | None] = mapped_column(String(300))
    revision: Mapped[str | None] = mapped_column(String(100))
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    owner: Mapped["Student | None"] = relationship("Student")
