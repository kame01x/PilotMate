"""Simulates a full pre-flight conversation for one test flight.
Runs the same tool functions the agent uses, without needing a Gemini key."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.preflight_agent import (
    create_flight,
    get_airport_info,
    get_document_checklist,
    get_mass_balance_reference,
    get_metar_taf,
    save_preflight_package,
    search_notams_active_areas,
)

DETAILS = {
    "departure_airport": "KSQL",
    "destination_airport": None,
    "route": "Local pattern work",
    "aircraft_type": "Cessna 172",
    "exercise_type": "stall",
    "runway_surface": "concrete",
    "controlled": True,
    "flight_rules": "VFR",
}


def show(title: str, data: dict) -> None:
    print(f"\n--- {title} ---")
    print(json.dumps(data, indent=2, default=str)[:1200])


def main() -> None:
    print("=== PilotMate Pre-flight Agent — simulated conversation ===\n")
    print(f"Student confirms flight details: {DETAILS}")

    metar_taf = get_metar_taf(DETAILS["departure_airport"])
    show("Weather (METAR/TAF)", metar_taf)

    airport = get_airport_info(DETAILS["departure_airport"])
    show("Airport info", airport)

    notams = search_notams_active_areas(f"{DETAILS['departure_airport']} California")
    show("NOTAM / active areas", notams)

    mass_balance = get_mass_balance_reference(DETAILS["aircraft_type"])
    show("Mass & balance reference", mass_balance)

    documents = get_document_checklist()
    show("Document checklist", documents)

    flight = create_flight("STU-0001", DETAILS)
    print(f"\nSaved Flight: {flight.flight_id} (id={flight.id})")

    package = {
        "mass_and_balance": mass_balance,
        "flight_plan": {"route": DETAILS["route"], "flight_rules": DETAILS["flight_rules"]},
        "metar_taf": metar_taf,
        "notam_summary": notams,
        "active_areas": notams,
        "charts_links": {"note": "Student to open official current charts for the route."},
        "frequencies": airport,
        "document_checklist": documents,
    }
    pkg = save_preflight_package(flight.id, package)
    print(f"Saved PreflightPackage for flight {flight.flight_id} (id={pkg.id})")
    print("\n=== Done. Verify the flight and package in the database. ===")


if __name__ == "__main__":
    main()
