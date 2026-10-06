"""Pre-flight Agent — collects flight details, gathers reference data via tools,
and produces a PreflightPackage for a Flight. Uses Gemini (google-genai) with
function calling. All safety-relevant output is reference data the student must verify."""

import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.gemini_chat import GeminiChat
from backend.config import AVIOWIKI_API_KEY, TAVILY_API_KEY
from backend.database import SessionLocal
from backend.models import Flight, PreflightPackage, Student

VERIFY_NOTICE = (
    "This is reference data only. The student/instructor must verify it against "
    "official sources before any actual flight."
)

MASS_BALANCE_REFERENCE = {
    "Cessna 172": {"empty_weight_kg": 730, "max_weight_kg": 1111, "arm_cm": 110},
    "Cessna 152": {"empty_weight_kg": 500, "max_weight_kg": 757, "arm_cm": 105},
    "Piper PA-28": {"empty_weight_kg": 680, "max_weight_kg": 1100, "arm_cm": 112},
}

DOCUMENT_CHECKLIST = [
    "Pilot Certificate (CPL/PPL)",
    "Radiotelephony (RT) certificate",
    "Medical certificate (valid)",
    "Insurance certificate",
    "Passport/ID (required for cross-country)",
]


def get_metar_taf(airport_icao: str) -> dict:
    url = "https://aviationweather.gov/api/data/metar"
    taf_url = "https://aviationweather.gov/api/data/taf"
    try:
        metar = httpx.get(url, params={"ids": airport_icao, "format": "json"}, timeout=15).json()
        taf = httpx.get(taf_url, params={"ids": airport_icao, "format": "json"}, timeout=15).json()
    except Exception as exc:
        return {"error": str(exc), "source": "https://aviationweather.gov"}
    return {
        "metar": metar,
        "taf": taf,
        "source": "https://aviationweather.gov",
        "notice": VERIFY_NOTICE,
    }


def get_airport_info(airport_icao: str) -> dict:
    url = f"https://api.aviowiki.com/free/airports/icao/{airport_icao}"
    headers = {"Authorization": f"Bearer {AVIOWIKI_API_KEY}"} if AVIOWIKI_API_KEY else {}
    try:
        resp = httpx.get(url, headers=headers, timeout=15)
        data = resp.json()
    except Exception as exc:
        return {"error": str(exc), "source": "https://www.aviowiki.com"}
    if resp.status_code != 200:
        return {"error": data, "source": "https://www.aviowiki.com"}
    return {
        "airport": data,
        "source": "https://www.aviowiki.com",
        "notice": VERIFY_NOTICE
        + " Cross-check runway surface and controlled status with the official AIP.",
    }


ICAO_PREFIX_TO_AIS = {
    "K": ("United States", ["notams.aim.faa.gov", "1800wxbrief.com"]),
    "C": ("Canada", ["navcanada.ca"]),
    "EG": ("United Kingdom", ["ais.nats.co.uk"]),
    "EI": ("Ireland", ["iaa.ie"]),
    "LF": ("France", ["notam.sia.aviation-civile.gouv.fr"]),
    "ED": ("Germany", ["dfs.de"]),
    "LE": ("Spain", ["enaire.es"]),
    "LI": ("Italy", ["enac.gov.it"]),
    "EH": ("Netherlands", ["lvdl.nl"]),
    "Y": ("Australia", ["airservicesaustralia.com"]),
    "NZ": ("New Zealand", ["airways.co.nz"]),
}


def resolve_country_and_ais(airport_icao: str) -> tuple[str, list[str]]:
    prefix2 = airport_icao[:2].upper()
    prefix1 = airport_icao[:1].upper()
    if prefix2 in ICAO_PREFIX_TO_AIS:
        return ICAO_PREFIX_TO_AIS[prefix2]
    if prefix1 in ICAO_PREFIX_TO_AIS:
        return ICAO_PREFIX_TO_AIS[prefix1]
    return ("Unknown", [])


def search_notams_active_areas(airport_icao: str, query: str | None = None) -> dict:
    # NOTE: requires TAVILY_API_KEY in .env (get a free key at https://tavily.com).
    # Until a key is set, this returns a notice instead of results.
    country, official_sites = resolve_country_and_ais(airport_icao)
    if query is None:
        query = airport_icao
    if not TAVILY_API_KEY:
        return {
            "error": "TAVILY_API_KEY not configured. Add it to .env to enable NOTAM search.",
            "detected_country": country,
            "official_sources": official_sites,
            "notice": VERIFY_NOTICE,
        }
    site_clause = " OR ".join(f"site:{site}" for site in official_sites) or ""
    search_query = f'{query} NOTAM active areas {site_clause}'.strip()
    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=TAVILY_API_KEY)
        results = client.search(query=search_query, max_results=5)
    except Exception as exc:
        return {"error": str(exc), "source": "https://tavily.com"}

    relevant = []
    for r in results.get("results", []):
        url = r.get("url", "")
        title = (r.get("title") or "").lower()
        content = (r.get("content") or "").lower()
        if airport_icao.lower() in title or airport_icao.lower() in content:
            relevant.append(r)
        elif any(site in url for site in official_sites):
            relevant.append(r)

    return {
        "query": search_query,
        "detected_country": country,
        "official_sources": official_sites,
        "clearly_relevant": len(relevant) > 0,
        "results": relevant if relevant else results.get("results", []),
        "notice": (
            VERIFY_NOTICE
            if relevant
            else f"No clearly relevant results found for {airport_icao} ({country}). Check the official AIS site manually: {', '.join(official_sites) or 'official national AIS'}."
        ),
    }


def get_mass_balance_reference(aircraft_type: str) -> dict:
    ref = MASS_BALANCE_REFERENCE.get(aircraft_type)
    if ref is None:
        return {
            "error": f"No reference data for '{aircraft_type}'. Known types: {list(MASS_BALANCE_REFERENCE)}",
            "notice": VERIFY_NOTICE,
        }
    return {
        "aircraft_type": aircraft_type,
        "typical_values": ref,
        "notice": VERIFY_NOTICE
        + " Student must confirm actual empty weight, arm, and load (passengers, bags, fuel) for the day.",
    }


def get_document_checklist() -> dict:
    return {"documents": DOCUMENT_CHECKLIST, "notice": "Student self-confirms possession and validity."}


TOOL_IMPLEMENTATIONS = {
    "get_metar_taf": get_metar_taf,
    "get_airport_info": get_airport_info,
    "search_notams_active_areas": search_notams_active_areas,
    "get_mass_balance_reference": get_mass_balance_reference,
    "get_document_checklist": get_document_checklist,
}

SYSTEM_PROMPT = """You are PilotMate's Pre-flight Agent. You help a student pilot plan a flight.
Flow:
1. Collect flight details: departure airport, destination (if cross-country), route, aircraft type, exercise type, flight rules (VFR/IFR).
2. For runway surface (grass/concrete) and controlled/uncontrolled, ALWAYS ask the student to confirm — never assume. You may call get_airport_info and flag conflicts, but never override the student's choice.
3. Use the tools to gather: weather (get_metar_taf), airport info (get_airport_info), NOTAMs/active areas (search_notams_active_areas), mass & balance reference (get_mass_balance_reference), document checklist (get_document_checklist).
4. Every safety-relevant output must visibly state it is reference data the student/instructor must verify, with the source link.
5. Once the student confirms everything, summarize the pre-flight package.
Never auto-override student input. Final confirmation is always manual."""


def _build_tool_declarations():
    from google.genai import types

    return [
            types.FunctionDeclaration(
                name="get_metar_taf",
                description="Get METAR and TAF weather for an airport",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={"airport_icao": types.Schema(type=types.Type.STRING)},
                    required=["airport_icao"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_airport_info",
                description="Get airport basics (runway, frequencies) from Aviowiki",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={"airport_icao": types.Schema(type=types.Type.STRING)},
                    required=["airport_icao"],
                ),
            ),
            types.FunctionDeclaration(
                name="search_notams_active_areas",
                description="Search the correct country's official AIS sources for NOTAM and active area info for an airport",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={"airport_icao": types.Schema(type=types.Type.STRING)},
                    required=["airport_icao"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_mass_balance_reference",
                description="Get typical POH mass and balance reference values for an aircraft type",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={"aircraft_type": types.Schema(type=types.Type.STRING)},
                    required=["aircraft_type"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_document_checklist",
                description="Get the pre-flight document checklist",
                parameters=types.Schema(type=types.Type.OBJECT, properties={}),
            ),
        ]

class PreflightAgent:
    def __init__(self, student_id: str):
        self.student_id = student_id
        self._chat = GeminiChat(
            SYSTEM_PROMPT, _build_tool_declarations(), TOOL_IMPLEMENTATIONS
        )

    def chat(self, message: str) -> str:
        return self._chat.chat(message)


def create_flight(student_id: str, details: dict) -> Flight:
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(student_id=student_id).first()
        if student is None:
            raise ValueError(f"Student {student_id} not found")
        count = session.query(Flight).count() + 1
        flight = Flight(
            flight_id=f"FLT-{count:04d}",
            student_id=student.id,
            date=datetime.now(timezone.utc),
            departure_airport=details["departure_airport"],
            destination_airport=details.get("destination_airport"),
            route=details.get("route"),
            aircraft_type=details.get("aircraft_type"),
            exercise_type=details.get("exercise_type"),
            runway_surface=details.get("runway_surface"),
            controlled=details.get("controlled"),
            flight_rules=details.get("flight_rules"),
        )
        session.add(flight)
        session.commit()
        session.refresh(flight)
        return flight
    finally:
        session.close()


def save_preflight_package(flight_id: int, package: dict) -> PreflightPackage:
    session = SessionLocal()
    try:
        pkg = PreflightPackage(
            flight_id=flight_id,
            mass_and_balance=package.get("mass_and_balance"),
            flight_plan=package.get("flight_plan"),
            metar_taf=package.get("metar_taf"),
            notam_summary=package.get("notam_summary"),
            active_areas=package.get("active_areas"),
            charts_links=package.get("charts_links"),
            frequencies=package.get("frequencies"),
            document_checklist=package.get("document_checklist"),
        )
        session.add(pkg)
        session.commit()
        session.refresh(pkg)
        return pkg
    finally:
        session.close()
