"""Aviation data layer — async, verified external sources only.

Every fetch returns a ToolResult; exceptions are captured inside it. No
fabrication: empty upstream data is reported as empty, errors as errors.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

from backend.config import TAVILY_API_KEY

AWC_METAR_URL = "https://aviationweather.gov/api/data/metar"
AWC_TAF_URL = "https://aviationweather.gov/api/data/taf"
AVIOWIKI_URL = "https://api.aviowiki.com/free/airports/icao/{icao}"
YOUTUBE_OEMBED_URL = "https://www.youtube.com/oembed"


@dataclass
class ToolResult:
    tool: str
    ok: bool
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def as_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "ok": self.ok,
            "data": self.data,
            "error": self.error,
            "fetched_at": self.fetched_at.isoformat(),
        }


async def _get_json(client: httpx.AsyncClient, url: str, params: dict | None = None) -> tuple[Any | None, str | None]:
    """GET returning (parsed_json_or_None, error). HTTP 204/empty body -> ([], None)."""
    try:
        resp = await client.get(url, params=params)
    except Exception as exc:  # noqa: BLE001 — tool boundary: capture everything
        return None, f"{type(exc).__name__}: {exc}"
    if resp.status_code == 204 or not resp.text.strip():
        return [], None
    if resp.status_code != 200:
        return None, f"HTTP {resp.status_code}"
    try:
        return resp.json(), None
    except ValueError:
        return None, "non-JSON response"


def _nearest_station(stations: list[dict], lat: float, lon: float) -> dict | None:
    if not stations:
        return None

    def sq(s: dict) -> float:
        dlat = (s.get("lat") or lat) - lat
        dlon = (s.get("lon") or lon) - lon
        return dlat * dlat + dlon * dlon

    best = min(stations, key=sq)
    dlat = (best.get("lat") or lat) - lat
    dlon = (best.get("lon") or lon) - lon
    km = ((dlat * 111.0) ** 2 + (dlon * 111.0 * 0.64) ** 2) ** 0.5
    return {
        "icao": best.get("icaoId"),
        "distance_km": round(km, 1),
        "raw_metar": best.get("rawOb"),
        "obs_time": best.get("reportTime"),
        "decoded": {
            "temp_c": best.get("temp"),
            "dewpoint_c": best.get("dewp"),
            "wind_dir_deg": best.get("wdir"),
            "wind_speed_kt": best.get("wspd"),
            "visibility": best.get("visib"),
            "altimeter_hpa": best.get("altim"),
        },
    }


async def fetch_metar_taf(client: httpx.AsyncClient, icao: str) -> ToolResult:
    metar, m_err = await _get_json(client, AWC_METAR_URL, {"ids": icao, "format": "json"})
    taf, t_err = await _get_json(client, AWC_TAF_URL, {"ids": icao, "format": "json"})
    data: dict[str, Any] = {
        "icao": icao,
        "metar": metar or None,
        "taf": taf or None,
        "source": "aviationweather.gov",
    }
    errors = [e for e in (m_err, t_err) if e]
    if not metar and not m_err:
        data["metar_unavailable"] = f"No METAR is published for {icao}."
    if not taf and not t_err:
        data["taf_unavailable"] = f"No TAF is published for {icao}."
    if (not metar) and not m_err:
        # nearest reporting station fallback (coords via AvioWiki)
        airport, _ = await fetch_airport_info(client, icao)
        coords = ((airport or {}).get("airport") or {}).get("coordinates") or {}
        lat, lon = coords.get("latitude"), coords.get("longitude")
        if lat is not None and lon is not None:
            bbox = f"{lat - 0.6},{lon - 0.6},{lat + 0.6},{lon + 0.6}"
            stations, _ = await _get_json(client, AWC_METAR_URL, {"bbox": bbox, "format": "json"})
            if isinstance(stations, list):
                nearest = _nearest_station(stations, lat, lon)
                if nearest:
                    data["nearest_reporting_station"] = nearest
                    data["metar_unavailable"] += (
                        f" Nearest reporting station: {nearest['icao']} "
                        f"({nearest['distance_km']} km away) — conditions may differ; verify locally."
                    )
    ok = not errors
    return ToolResult(tool="metar_taf", ok=ok, data=data, error="; ".join(errors) or None)


async def fetch_airport_info(client: httpx.AsyncClient, icao: str) -> tuple[dict | None, str | None]:
    payload, err = await _get_json(client, AVIOWIKI_URL.format(icao=icao))
    if err:
        return None, err
    if isinstance(payload, dict) and payload.get("error"):
        return None, str(payload.get("error"))[:200]
    if not isinstance(payload, dict) or "icao" not in payload:
        return None, None  # clean miss — not an error
    return payload, None


async def fetch_airport(client: httpx.AsyncClient, icao: str) -> ToolResult:
    airport, err = await fetch_airport_info(client, icao)
    data: dict[str, Any] = {"icao": icao, "airport": airport, "source": "aviowiki.com"}
    if airport is None and not err:
        data["unavailable"] = f"No AvioWiki record found for {icao}."
    return ToolResult(tool="airport_info", ok=err is None, data=data, error=err)


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
    "LK": ("Czechia", ["aim.rlp.cz"]),
    "Y": ("Australia", ["airservicesaustralia.com"]),
    "NZ": ("New Zealand", ["airways.co.nz"]),
}


def resolve_country_and_ais(icao: str) -> tuple[str, list[str]]:
    for key in (icao[:2].upper(), icao[:1].upper()):
        if key in ICAO_PREFIX_TO_AIS:
            return ICAO_PREFIX_TO_AIS[key]
    return ("Unknown", [])


def _search_notams_sync(query: str) -> tuple[list[dict] | None, str | None]:
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=TAVILY_API_KEY)
        results = client.search(query=query, max_results=5)
        return list(results.get("results", [])), None
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}: {exc}"


async def fetch_notams(client: httpx.AsyncClient, icao: str) -> ToolResult:
    country, official_sites = resolve_country_and_ais(icao)
    if not TAVILY_API_KEY:
        return ToolResult(
            tool="notams", ok=False, data={"detected_country": country, "official_sources": official_sites},
            error="TAVILY_API_KEY not configured — NOTAM search unavailable.",
        )
    site_clause = " OR ".join(f"site:{site}" for site in official_sites) or ""
    query = f"{icao} NOTAM active areas {site_clause}".strip()
    results, err = await asyncio.to_thread(_search_notams_sync, query)
    if err:
        return ToolResult(tool="notams", ok=False, error=err,
                          data={"detected_country": country, "official_sources": official_sites})
    relevant = []
    for r in results or []:
        url = r.get("url", "")
        text = ((r.get("title") or "") + " " + (r.get("content") or "")).lower()
        if icao.lower() in text or any(site in url for site in official_sites):
            relevant.append(r)
    return ToolResult(
        tool="notams", ok=True,
        data={
            "query": query,
            "detected_country": country,
            "official_sources": official_sites,
            "results": relevant if relevant else (results or []),
            "clearly_relevant": bool(relevant),
        },
    )


# ---------------------------------------------------------------------------
# Video discovery with real verification (YouTube oEmbed)
# ---------------------------------------------------------------------------

YOUTUBE_ID_PATTERNS = (
    "youtube.com/watch?v=", "youtu.be/", "youtube.com/shorts/",
    "youtube.com/embed/", "youtube.com/v/",
)


def extract_youtube_id(url: str) -> str | None:
    for pat in YOUTUBE_ID_PATTERNS:
        if pat in url:
            tail = url.split(pat, 1)[1]
            vid = tail.split("?")[0].split("&")[0].split("/")[0]
            if vid and 5 <= len(vid) <= 20 and vid.replace("-", "").replace("_", "").isalnum():
                return vid
    return None


def _oembed_sync(video_id: str) -> dict | None:
    try:
        resp = httpx.get(
            YOUTUBE_OEMBED_URL,
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:  # noqa: BLE001
        return None


async def find_verified_video(topic: str, preferred_sources: list[str] | None = None) -> ToolResult:
    """Search via Tavily, then verify each candidate through YouTube oEmbed.

    Only videos that oEmbed confirms (type VideoObject) are returned. No key
    required for oEmbed; Tavily key required for discovery.
    """
    if not TAVILY_API_KEY:
        return ToolResult(tool="video_search", ok=False, error="TAVILY_API_KEY not configured.")
    query = f"{topic} flight training instructional video youtube"
    results, err = await asyncio.to_thread(_search_notams_sync, query)
    if err:
        return ToolResult(tool="video_search", ok=False, error=err)
    preferred = [s.lower() for s in (preferred_sources or ["mzeroa", "flightops", "aopa", "avweb", "boldmethod"])]
    candidates = []
    for r in results or []:
        vid = extract_youtube_id(r.get("url", ""))
        if vid:
            candidates.append((vid, r))
        if len(candidates) >= 4:
            break
    verified = []
    for vid, r in candidates:
        meta = await asyncio.to_thread(_oembed_sync, vid)
        if not meta or meta.get("type") != "VideoObject":
            continue  # not verified / not a video / embedding metadata unavailable
        verified.append({
            "video_id": vid,
            "url": f"https://www.youtube.com/watch?v={vid}",
            "embed_url": f"https://www.youtube.com/embed/{vid}",
            "thumbnail_url": meta.get("thumbnail_url"),
            "title": meta.get("title"),
            "channel": meta.get("author_name"),
            "source": "youtube oEmbed (verified)",
            "search_snippet": (r.get("content") or "")[:280],
            "preferred_source": any(p in (meta.get("author_name") or "").lower() for p in preferred),
        })
        if len(verified) >= 2:
            break
    return ToolResult(
        tool="video_search", ok=True,
        data={"topic": topic, "videos": verified,
              "note": None if verified else "No verified YouTube video found for this topic."},
    )
