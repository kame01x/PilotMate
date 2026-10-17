"""Seed a clearly-labelled SYNTHETIC demo aircraft for mass & balance (Phase 21B).

The numbers are EXAMPLE values modelled loosely on a C172-class aircraft —
they are NOT from a real POH/AFM and must never be used for a real flight.
Real aircraft: enter your own weight schedule in the pre-flight form.

Usage: uv run python scripts/seed_demo_aircraft.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.massbalance import validate_schedule
from backend.models import Aircraft

DEMO_REG = "N172DEMO"

DEMO_SCHEDULE = {
    "mass_unit": "lb",
    "arm_unit": "in",
    "empty_mass": 1500.0,
    "empty_arm": 39.0,
    "max_mass": 2300.0,
    "min_cg": 35.0,
    "max_cg": 47.0,
    "default_fuel_density": 6.0,           # lb per US gal (synthetic, unit explicit)
    "default_fuel_density_unit": "lb_per_us_gal",
    "fuel_burn_kg_per_hour": 8.0,          # kg/h — enables the landing condition
    "stations": [
        {"id": "front", "label": "Front seats", "arm": 37.0, "kind": "seat", "max_mass": 400.0},
        {"id": "rear", "label": "Rear seats", "arm": 73.0, "kind": "seat", "max_mass": 400.0},
        {"id": "bag1", "label": "Baggage area 1", "arm": 95.0, "kind": "baggage", "max_mass": 120.0},
        {"id": "fuel_left", "label": "Left tank", "arm": 48.0, "kind": "fuel", "capacity_l": 95.0},
        {"id": "fuel_right", "label": "Right tank", "arm": 48.0, "kind": "fuel", "capacity_l": 95.0},
    ],
    "envelope": [
        {"mass": 1500.0, "min_cg": 35.0, "max_cg": 47.0},
        {"mass": 1800.0, "min_cg": 35.0, "max_cg": 47.0},
        {"mass": 2100.0, "min_cg": 36.0, "max_cg": 46.0},
        {"mass": 2300.0, "min_cg": 38.0, "max_cg": 44.0},
    ],
}

SOURCE = "SYNTHETIC EXAMPLE DATA — not from a real POH/AFM (seed script)"


def main() -> None:
    problems = validate_schedule(DEMO_SCHEDULE)
    if problems:
        print("Refusing to seed — invalid schedule:", "; ".join(problems))
        sys.exit(1)
    db = SessionLocal()
    try:
        ac = db.query(Aircraft).filter(Aircraft.registration == DEMO_REG).first()
        if ac is None:
            ac = Aircraft(registration=DEMO_REG)
            db.add(ac)
        ac.aircraft_type = "Cessna 172 (synthetic example)"
        ac.schedule = DEMO_SCHEDULE
        ac.source = SOURCE
        ac.revision = "demo-1"
        ac.verified = False
        db.commit()
        print(f"Seeded {DEMO_REG} — {SOURCE}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
