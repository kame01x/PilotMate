"""Deterministic section producers.

Each specialist builds one BriefingSection from FlightContext + ToolResults.
They never invent facts: missing data -> UNAVAILABLE with an explanation;
tool errors -> FAILED with the error string. Blocks are structured JSON
rendered app-wide by the shared AiBlocks component (types: heading,
paragraph, bullets, numbered, kv, warning, video).
"""
from __future__ import annotations

from datetime import datetime, timezone

from backend.preflight.contracts import (
    BriefingSection,
    FlightContext,
    SectionStatus,
    Source,
    VERIFY_NOTICE,
)


def _src(name: str, url: str | None = None) -> Source:
    return Source(name=name, url=url, fetched_at=datetime.now(timezone.utc))


def kv(pairs: list[tuple[str, str]]) -> dict:
    return {"type": "kv", "rows": [{"label": k, "value": v} for k, v in pairs if v not in (None, "")]}


def paragraph(text: str) -> dict:
    return {"type": "paragraph", "text": text}


def bullets(items: list[str]) -> dict:
    return {"type": "bullets", "items": [i for i in items if i]}


def numbered(items: list[str]) -> dict:
    return {"type": "numbered", "items": [i for i in items if i]}


def warning(text: str) -> dict:
    return {"type": "warning", "text": text}


# ---------------------------------------------------------------------------
# flight_overview — instant, from the form only (user-confirmed facts)
# ---------------------------------------------------------------------------

def build_overview(ctx: FlightContext) -> BriefingSection:
    exercises = ", ".join(ctx.exercises) if ctx.exercises else "—"
    blocks: list[dict] = []
    if ctx.submitted_message:
        blocks.append(paragraph(f"Request: {ctx.submitted_message}"))
    blocks.append(kv([
        ("Departure", ctx.departure),
        ("Destination", ctx.destination or "—"),
        ("Route", ctx.route or "—"),
        ("Aircraft", f"{ctx.aircraft_type or '—'} ({ctx.aircraft_registration or 'unregistered'})"),
        ("Rules", ctx.rules),
        ("Flight period", ctx.flight_period),
        ("Date", ctx.flight_date or "—"),
        ("Departure time", ctx.departure_time or "—"),
        ("Exercises", exercises),
        ("Fuel", ctx.fuel or "—"),
        ("Endurance", ctx.endurance or "—"),
        ("Authority", ctx.authority or "—"),
    ]))
    return BriefingSection(
        section_id="flight_overview",
        title="Flight Overview",
        status=SectionStatus.OK,
        blocks=blocks,
        sources=[_src("Student-submitted form data")],
        notice=VERIFY_NOTICE,
    )


def build_day_night(ctx: FlightContext) -> BriefingSection:
    items = [
        f"Declared flight period: {ctx.flight_period}.",
        "This is a reference briefing — confirm civil twilight times for your route/date "
        "from an official almanac or EFB; night requirements vary by country "
        "(e.g. lighting, logbook, currency).",
    ]
    if ctx.flight_period == "night" and ctx.rules == "VFR":
        items.append("Night VFR: verify your licence/rating privileges, aircraft lighting "
                     "and equipment, and local alternates before departure.")
    return BriefingSection(
        section_id="day_night",
        title="Day / Night Considerations",
        status=SectionStatus.OK,
        blocks=[bullets(items)],
        notice=VERIFY_NOTICE,
    )


# ---------------------------------------------------------------------------
# documents + mass&balance — instant reference from library DB
# ---------------------------------------------------------------------------

def build_documents(ctx: FlightContext) -> BriefingSection:
    from backend.documents import get_library_reference

    try:
        ref = get_library_reference(aircraft_type=ctx.aircraft_type) or {}
    except Exception as exc:  # noqa: BLE001
        return BriefingSection(
            section_id="documents", title="Required Documents & Checklist",
            status=SectionStatus.FAILED, error=f"{type(exc).__name__}: {exc}",
        )
    docs = ref.get("documents", []) if isinstance(ref, dict) else []
    if not docs:
        return BriefingSection(
            section_id="documents", title="Required Documents & Checklist",
            status=SectionStatus.UNAVAILABLE,
            blocks=[paragraph("No library documents match this aircraft type yet. "
                              "Check your organisation's document pack.")],
        )
    blocks = [bullets([
        f"{d.get('title')} — {d.get('file_reference') or 'file pending'} "
        f"({d.get('document_type') or 'reference'})"
        for d in docs[:10]
    ])]
    blocks.append(warning("Verify currency/revision of each document before the flight."))
    return BriefingSection(
        section_id="documents", title="Required Documents & Checklist",
        status=SectionStatus.OK, blocks=blocks, sources=[_src("PilotMate document library")],
    )


def build_mass_balance(ctx: FlightContext) -> BriefingSection:
    blocks: list[dict] = []
    if ctx.aircraft_registration:
        blocks.append(paragraph(
            f"Mass & balance must be calculated for {ctx.aircraft_registration} using the "
            f"current weight schedule and POH/AFM data for the {ctx.aircraft_type or 'selected aircraft'}."
        ))
    else:
        blocks.append(warning("No aircraft registration provided — a mass & balance "
                              "calculation cannot be pre-filled."))
    blocks.append(numbered([
        "Obtain empty weight + CG from the latest weight schedule.",
        "Add occupants and baggage using the actual loaded positions.",
        "Add fuel loaded (kg/L) and convert with the correct density.",
        "Plot total mass and CG on the envelope for the applicable flight phase.",
        "Record the result in the aircraft's mass & balance document.",
    ]))
    if ctx.fuel or ctx.endurance:
        blocks.append(kv([("Stated fuel", ctx.fuel or "—"), ("Stated endurance", ctx.endurance or "—")]))
    return BriefingSection(
        section_id="mass_balance", title="Mass & Balance",
        status=SectionStatus.OK, blocks=blocks,
        notice=VERIFY_NOTICE,
    )


# ---------------------------------------------------------------------------
# weather — AWC METAR/TAF (async tool result)
# ---------------------------------------------------------------------------

def _fmt_metar_entry(m: dict) -> list[str]:
    lines = [f"{m.get('icaoId')}: {m.get('rawOb')}"]
    decoded = []
    if m.get("temp") is not None:
        decoded.append(f"Temp/dewpoint {m.get('temp')}°C/{m.get('dewp')}°C")
    if m.get("wspd") is not None:
        decoded.append(f"Wind {m.get('wdir') or 'VRB'}°/{m.get('wspd')} kt")
    if m.get("visib") is not None:
        decoded.append(f"Visibility {m.get('visib')}")
    if m.get("altim") is not None:
        decoded.append(f"Altimeter {m.get('altim')} hPa")
    if decoded:
        lines.append(" — ".join(decoded))
    if m.get("reportTime"):
        lines.append(f"Observed: {m.get('reportTime')}")
    return lines


def build_weather(ctx: FlightContext, weather_result) -> BriefingSection:
    """weather_result: ToolResult from data.fetch_metar_taf."""
    if not weather_result.ok:
        return BriefingSection(
            section_id="weather", title="Weather (METAR / TAF)",
            status=SectionStatus.FAILED,
            error=weather_result.error or "weather source error",
        )
    d = weather_result.data
    blocks: list[dict] = []
    metar = d.get("metar") or []
    taf = d.get("taf") or []
    if metar:
        lines: list[str] = []
        for m in metar:
            lines.extend(_fmt_metar_entry(m))
        blocks.append({"type": "code", "text": "\n".join(lines)})
    elif d.get("metar_unavailable"):
        blocks.append(warning(d["metar_unavailable"]))
    if taf:
        lines = []
        for t in taf:
            lines.append(f"{t.get('icaoId')}: {t.get('rawTAF')}")
            if t.get("fcstTimeFrom") and t.get("fcstTimeTo"):
                lines.append(f"Valid: {t.get('fcstTimeFrom')} → {t.get('fcstTimeTo')}")
        blocks.append({"type": "code", "text": "\n".join(lines)})
    elif d.get("taf_unavailable"):
        blocks.append(warning(d["taf_unavailable"]))
    nearest = d.get("nearest_reporting_station")
    if nearest:
        blocks.append(kv([
            ("Nearest station", nearest.get("icao")),
            ("Distance", f"{nearest.get('distance_km')} km"),
            ("Observed", nearest.get("obs_time") or "—"),
        ]))
        if nearest.get("raw_metar"):
            blocks.append({"type": "code", "text": nearest["raw_metar"]})
    if not blocks:
        blocks.append(paragraph(f"No METAR/TAF data returned for {d.get('icao')}."))
    blocks.append(warning(VERIFY_NOTICE))
    return BriefingSection(
        section_id="weather", title="Weather (METAR / TAF)",
        status=SectionStatus.OK if blocks else SectionStatus.UNAVAILABLE,
        blocks=blocks, sources=[_src("aviationweather.gov", "https://aviationweather.gov")],
    )


# ---------------------------------------------------------------------------
# airports — AvioWiki (async tool result)
# ---------------------------------------------------------------------------

def _airport_blocks(airport_data: dict, role: str) -> tuple[list[dict], list[Source]]:
    a = airport_data.get("airport") or {}
    icao = airport_data.get("icao")
    blocks: list[dict] = []
    sources = [_src("aviowiki.com", "https://www.aviowiki.com")]
    if not a:
        blocks.append(warning(f"No detailed record found for {icao} ({role}). "
                              "Verify the field in the official AIP/AD 2 chart."))
        return blocks, sources
    coords = a.get("coordinates") or {}
    kv_rows = [
        ("ICAO", a.get("icao")),
        ("Name", a.get("name")),
        ("Country", a.get("country")),
        ("Elevation", f"{a.get('elevation_m')} m" if a.get("elevation_m") is not None else "—"),
        ("Lat/Lon", f"{coords.get('latitude')}, {coords.get('longitude')}")
        if coords.get("latitude") is not None else "—",
    ]
    runway = a.get("runway") or a.get("runways") or {}
    if isinstance(runway, dict) and runway:
        kv_rows.append(("Primary runway", f"{runway.get('designator')} — "
                                          f"{runway.get('length_m')} m × {runway.get('width_m')} m"
                                          if runway.get("length_m") else str(runway)))
    blocks.append(kv(kv_rows))
    freqs = a.get("frequencies") or []
    if isinstance(freqs, list) and freqs:
        blocks.append(bullets([
            f"{f.get('name') or f.get('type')}: {f.get('frequency_mhz')} MHz"
            for f in freqs[:6] if isinstance(f, dict)
        ]))
    return blocks, sources


def build_airport(ctx: FlightContext, icao: str, role: str, airport_result) -> BriefingSection:
    section_id = f"airport_{role}"
    title = f"{'Departure' if role == 'departure' else 'Destination'} Airport ({icao})"
    if not airport_result.ok:
        return BriefingSection(section_id=section_id, title=title,
                               status=SectionStatus.FAILED, error=airport_result.error)
    blocks, sources = _airport_blocks(airport_result.data, role)
    confirmed_bits = []
    if role == "departure":
        if ctx.dep_surface:
            confirmed_bits.append(f"Runway surface (student-confirmed): {ctx.dep_surface}")
        if ctx.dep_controlled is not None:
            confirmed_bits.append(
                f"Airspace: {'controlled' if ctx.dep_controlled else 'uncontrolled'} (student-confirmed)")
    else:
        if ctx.dest_surface:
            confirmed_bits.append(f"Runway surface (student-confirmed): {ctx.dest_surface}")
        if ctx.dest_controlled is not None:
            confirmed_bits.append(
                f"Airspace: {'controlled' if ctx.dest_controlled else 'uncontrolled'} (student-confirmed)")
    if confirmed_bits:
        blocks.append(bullets(confirmed_bits))
    blocks.append(warning(VERIFY_NOTICE))
    return BriefingSection(section_id=section_id, title=title,
                           status=SectionStatus.OK, blocks=blocks, sources=sources)


# ---------------------------------------------------------------------------
# NOTAMs — Tavily results (async tool result)
# ---------------------------------------------------------------------------

def build_notams(ctx: FlightContext, icaos: list[str], notam_result) -> BriefingSection:
    if not notam_result.ok:
        return BriefingSection(section_id="notams", title="NOTAMs & Active Areas",
                               status=SectionStatus.FAILED, error=notam_result.error)
    d = notam_result.data
    blocks: list[dict] = []
    blocks.append(paragraph(
        f"Search performed for {', '.join(icaos)} — detected region: {d.get('detected_country')}."
    ))
    results = d.get("results") or []
    if results:
        blocks.append(bullets([
            f"{r.get('title')} — {r.get('url')}" for r in results[:6]
        ]))
    else:
        blocks.append(warning("No active-area results returned by the web search."))
    if not d.get("clearly_relevant"):
        blocks.append(warning("These results come from web search and may not be official or current. "
                              "Check the official NOTAM source for your region before flight."))
    official = d.get("official_sources") or []
    if official:
        blocks.append(paragraph("Official sources to verify: " + ", ".join(official)))
    blocks.append(warning(VERIFY_NOTICE))
    return BriefingSection(
        section_id="notams", title="NOTAMs & Active Areas",
        status=SectionStatus.OK, blocks=blocks,
        sources=[_src("Tavily search")] + [_src(s) for s in official[:3]],
    )


# ---------------------------------------------------------------------------
# aircraft & planning — form-derived planning skeleton
# ---------------------------------------------------------------------------

def build_aircraft_planning(ctx: FlightContext) -> BriefingSection:
    blocks: list[dict] = [
        paragraph(
            f"Planning skeleton for {ctx.aircraft_type or 'the selected aircraft'} "
            f"({ctx.aircraft_registration or 'registration not provided'}), {ctx.rules} rules."
        ),
        numbered([
            "Review POH/AFM performance data for the selected runway and conditions.",
            "Check take-off/landing distance requirements for the expected surface.",
            "Calculate cruise fuel flow and reserve for the planned endurance.",
            "Identify enroute alternates; for IFR ensure legal alternates exist.",
            "Brief passengers on safety and equipment before boarding.",
        ]),
    ]
    if ctx.route:
        blocks.append(paragraph(f"Route to validate: {ctx.route}"))
    return BriefingSection(
        section_id="aircraft_planning", title="Aircraft & Flight Planning",
        status=SectionStatus.OK, blocks=blocks, notice=VERIFY_NOTICE,
    )


# ---------------------------------------------------------------------------
# videos — verified YouTube cards (async tool results)
# ---------------------------------------------------------------------------

def build_videos(video_results: list) -> BriefingSection:
    """video_results: list of ToolResult from data.find_verified_video."""
    videos = []
    errors = []
    for r in video_results:
        if r.ok:
            videos.extend(r.data.get("videos") or [])
        else:
            errors.append(r.error)
    if not videos:
        status = SectionStatus.UNAVAILABLE
        blocks = [paragraph("No verified training video found for this briefing's topics.")]
        if errors:
            blocks.append(warning(f"Video search errors: {'; '.join(e for e in errors if e)}"))
    else:
        status = SectionStatus.OK
        blocks = [{"type": "video", **v} for v in videos[:2]]
    return BriefingSection(
        section_id="videos", title="Training Videos",
        status=status, blocks=blocks,
        sources=[_src("YouTube (verified via oEmbed)")],
    )


# ---------------------------------------------------------------------------
# operational_considerations / sources — assembled by the orchestrator
# ---------------------------------------------------------------------------

def build_sources(ctx: FlightContext, all_sections: list[BriefingSection]) -> BriefingSection:
    seen: dict[str, str | None] = {}
    for s in all_sections:
        for src in s.sources:
            seen[src.name] = src.url
    blocks: list[dict] = [{"type": "bullets", "items": [
        f"{name}{' — ' + url if url else ''}" for name, url in seen.items()
    ]}] if seen else [paragraph("No external sources were consulted for this briefing.")]
    blocks.append(warning(VERIFY_NOTICE))
    return BriefingSection(
        section_id="sources", title="Sources & Limitations",
        status=SectionStatus.OK, blocks=blocks,
    )
