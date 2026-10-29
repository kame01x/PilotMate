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
from backend.documents import get_library_reference
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


AWC_METAR_URL = "https://aviationweather.gov/api/data/metar"
AWC_TAF_URL = "https://aviationweather.gov/api/data/taf"


def _awc_fetch(url: str, params: dict) -> tuple[list | None, str | None]:
    """Fetch from aviationweather.gov.

    Returns (data, error). Empty results (HTTP 204 or []) come back as [] with
    no error — meaning the station simply doesn't publish that product.
    """
    try:
        resp = httpx.get(url, params=params, timeout=15, follow_redirects=True)
    except Exception as exc:
        return None, str(exc)
    if resp.status_code == 204 or not resp.text.strip():
        return [], None
    if resp.status_code != 200:
        return None, f"HTTP {resp.status_code}"
    try:
        data = resp.json()
    except ValueError:
        return None, "non-JSON response"
    if isinstance(data, dict):  # AWC error payload: {"status": "error", ...}
        return None, str(data.get("error") or data.get("message") or data)[:200]
    return data, None


def _nearest_reporting_station(lat: float, lon: float, radius: float = 0.6) -> dict | None:
    """Find the nearest station publishing a METAR within ~radius degrees."""
    bbox = f"{lat - radius},{lon - radius},{lat + radius},{lon + radius}"
    stations, _ = _awc_fetch(AWC_METAR_URL, {"bbox": bbox, "format": "json"})
    if not stations:
        return None

    def squared_distance(s: dict) -> float:
        dlat = (s.get("lat") or lat) - lat
        dlon = (s.get("lon") or lon) - lon
        return dlat * dlat + dlon * dlon

    best = min(stations, key=squared_distance)
    dlat = (best.get("lat") or lat) - lat
    dlon = (best.get("lon") or lon) - lon
    km = ((dlat * 111.0) ** 2 + (dlon * 111.0 * 0.64) ** 2) ** 0.5
    return {
        "icao": best.get("icaoId"),
        "distance_km": round(km, 1),
        "raw_metar": best.get("rawOb"),
        "obs_time": best.get("reportTime"),
    }


def get_metar_taf(airport_icao: str) -> dict:
    metar, metar_err = _awc_fetch(AWC_METAR_URL, {"ids": airport_icao, "format": "json"})
    taf, taf_err = _awc_fetch(AWC_TAF_URL, {"ids": airport_icao, "format": "json"})
    result: dict = {"source": "https://aviationweather.gov", "notice": VERIFY_NOTICE}
    if metar_err or taf_err:
        result["error"] = "; ".join(
            f"{name}: {err}" for name, err in (("METAR", metar_err), ("TAF", taf_err)) if err
        )
    result["metar"] = metar or None
    result["taf"] = taf or None

    if not metar:
        result["metar_unavailable"] = (
            f"No METAR is published for {airport_icao} (no routine observations from this station)."
        )
        try:
            airport = (get_airport_info(airport_icao).get("airport") or {})
            coords = airport.get("coordinates") or {}
            lat, lon = coords.get("latitude"), coords.get("longitude")
            if lat is not None and lon is not None:
                nearest = _nearest_reporting_station(lat, lon)
                if nearest:
                    result["nearest_reporting_station"] = nearest
                    result["metar_unavailable"] += (
                        f" Nearest reporting station: {nearest['icao']} "
                        f"({nearest['distance_km']} km away) — conditions there may differ; verify locally."
                    )
        except Exception:
            pass
    if not taf:
        result["taf_unavailable"] = f"No TAF is published for {airport_icao}."
    return result


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
    "get_library_reference": get_library_reference,
}

SYSTEM_PROMPT = """You are PilotMate's Pre-flight Agent. You help a student pilot plan a flight.
Flow:
1. Collect flight details: departure airport, destination (if cross-country), route, aircraft type, exercise type, flight rules (VFR/IFR).
2. For runway surface (grass/concrete) and controlled/uncontrolled, ALWAYS ask the student to confirm — never assume. You may call get_airport_info and flag conflicts, but never override the student's choice.
3. Use the tools to gather: weather (get_metar_taf), airport info (get_airport_info), NOTAMs/active areas (search_notams_active_areas), mass & balance reference (get_mass_balance_reference), document checklist (get_document_checklist), and real library references where relevant (get_library_reference).
4. Every safety-relevant output must visibly state it is reference data the student/instructor must verify, with the source link.
5. Once the student confirms everything, summarize the pre-flight package.
Never auto-override student input. Final confirmation is always manual.

OUTPUT FORMAT — you MUST structure the briefing with these exact section headings:
## Flight Overview
## Weather Briefing
## Departure Airport
## Destination Airport
## NOTAMs and Airspace
## Route and Navigation
## Aircraft and Planned Exercises
## Day/Night Considerations
## Hazards and Risk Assessment
## Pre-flight Review Checklist
## Data Sources and Limitations

Rules for each section:
- If data is unavailable, write "Data unavailable — [reason]" rather than omitting the section.
- Distinguish observations from forecasts. Include timestamps where available.
- Never invent runway headings, performance figures, or procedures.
- End every section with a source reference when data was retrieved."""


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
                name="get_library_reference",
                description="Look up a real reference document (POH, checklist, charts) from the library",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "aircraft_type": types.Schema(type=types.Type.STRING),
                        "document_type": types.Schema(type=types.Type.STRING),
                        "category": types.Schema(type=types.Type.STRING),
                    },
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

    def suggest_routes(self, departure: str, destination: str | None, aircraft_type: str, exercise: str) -> dict:
        from google.genai import types

        prompt = (
            f"Suggest 1-3 candidate flight routes from {departure}"
            + (f" to {destination}" if destination else " (local flight)")
            + f" in a {aircraft_type} for exercise: {exercise}. "
            "Use get_airport_info for both airports if needed. "
            "Return a JSON object with a 'routes' array, each with 'name', 'description', 'waypoints'. "
            "Label these as AI-generated suggestions requiring pilot verification."
        )
        response = self._chat.chat(prompt)
        try:
            import json
            parsed = json.loads(response)
            if isinstance(parsed, dict) and "routes" in parsed:
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
        return {"routes": [{"name": "Suggested route", "description": response, "waypoints": []}]}


def create_flight(student_id: str, details: dict, date: datetime | None = None) -> Flight:
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(student_id=student_id).first()
        if student is None:
            raise ValueError(f"Student {student_id} not found")
        count = session.query(Flight).count() + 1
        flight = Flight(
            flight_id=f"FLT-{count:04d}",
            student_id=student.id,
            date=date or datetime.now(timezone.utc),
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
