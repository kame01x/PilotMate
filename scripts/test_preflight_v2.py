"""Pre-flight v2 regression tests — offline, mocked providers.

Run:  uv run python scripts/test_preflight_v2.py

Guarantees under test (these are the bugs the rebuild must never reintroduce):
 1. run_briefing ALWAYS returns a BriefingResult — never None, never raises
    for section-level failures (total tool failure => status=failed, still a result).
 2. Every section carries an explicit status; a failed tool => FAILED section with
    an error string, not a missing/null section.
 3. Narrative (LLM) failure never blocks the deterministic briefing.
 4. Cancellation returns a PARTIAL result with the sections that completed.
 5. SSE frames are well-formed and always terminal (completed OR failed).
 6. BriefingRequest rejects missing departure (422 contract).
 7. assemble_text always produces non-empty text for any result.
 8. Video blocks only come from verified (mocked oEmbed) results.
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.preflight import data as data_mod
from backend.preflight import orchestrator
from backend.preflight.contracts import (
    BriefingRequest,
    BriefingStatus,
    FlightContext,
    SectionStatus,
    new_generation_id,
)
from backend.preflight.data import ToolResult

PASSED = []
FAILED = []


def check(name: str, cond: bool, detail: str = ""):
    if cond:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append(name)
        print(f"  FAIL  {name} {detail}")


def make_ctx(**overrides) -> FlightContext:
    req = BriefingRequest(
        message="test briefing",
        departure="LKLT",
        destination="LKKB",
        aircraft_type="Cessna 172",
        exercise="cross-country",
        rules="VFR",
        flight_period="day",
        **overrides,
    )
    return FlightContext.from_request(req, new_generation_id())


# ---------------------------------------------------------------------------
# Mocks
# ---------------------------------------------------------------------------

def ok_weather(client, icao):
    async def _():
        return ToolResult(tool="metar_taf", ok=True, data={
            "icao": icao,
            "metar": [{"icaoId": icao, "rawOb": f"{icao} 121000Z 27010KT 9999 FEW030 15/08 A1015",
                       "temp": 15, "dewp": 8, "wdir": 270, "wspd": 10, "visib": 10, "altim": 1015}],
            "taf": [],
            "source": "mock",
        })
    return _()


def ok_airport(client, icao):
    async def _():
        return ToolResult(tool="airport_info", ok=True, data={
            "icao": icao,
            "airport": {"icao": icao, "name": f"Mock {icao}", "country": "CZ",
                        "elevation_m": 300, "coordinates": {"latitude": 49.0, "longitude": 14.0}},
            "source": "mock",
        })
    return _()


def ok_notams(client, icaos):
    async def _():
        return ToolResult(tool="notams", ok=True, data={
            "detected_country": "Czechia", "official_sources": ["aim.rlp.cz"],
            "results": [{"title": "RWY closed", "url": "https://example.com/n1"}],
            "clearly_relevant": True, "query": "mock",
        })
    return _()


def ok_video(topic, preferred_sources=None):
    async def _():
        return ToolResult(tool="video_search", ok=True, data={
            "topic": topic,
            "videos": [{
                "video_id": "abc12345", "url": "https://www.youtube.com/watch?v=abc12345",
                "embed_url": "https://www.youtube.com/embed/abc12345",
                "thumbnail_url": "https://i.ytimg.com/vi/abc12345/hqdefault.jpg",
                "title": "Mock training video", "channel": "MockChannel",
                "source": "youtube oEmbed (verified)", "preferred_source": True,
            }],
        })
    return _()


async def ok_narrative(ctx, facts):
    from backend.preflight.specialists import bullets, warning
    from backend.preflight.contracts import BriefingSection, VERIFY_NOTICE
    return (
        BriefingSection(
            section_id="operational_considerations",
            title="Operational Considerations & Planning Notes",
            status=SectionStatus.OK,
            blocks=[bullets(["Mock operational note."])],
        ),
        None,  # provider notice: null when primary served
    )


async def failing_narrative(ctx, facts):
    from backend.preflight.contracts import BriefingSection
    return (
        BriefingSection(
            section_id="operational_considerations",
            title="Operational Considerations & Planning Notes",
            status=SectionStatus.FAILED,
            error="mock provider outage",
        ),
        "mock fallback notice",
    )


def failing_tool(msg="mock tool outage"):
    async def _(client, *a, **k):
        return ToolResult(tool="mock", ok=False, error=msg)
    return _


def failing_video(topic, preferred_sources=None):
    async def _():
        return ToolResult(tool="video_search", ok=False, error="mock video outage")
    return _()


def patch_all(weather=ok_weather, airport=ok_airport, notams=ok_notams,
              video=ok_video, narrative=ok_narrative, docs_ok=True):
    data_mod.fetch_metar_taf = weather
    data_mod.fetch_airport = airport
    data_mod.fetch_notams = notams
    data_mod.find_verified_video = video
    orchestrator.build_narrative = narrative
    import backend.documents as docs
    if docs_ok:
        docs.get_library_reference = lambda aircraft_type=None, **k: {
            "documents": [{"title": "Mock POH", "file_reference": "POH-1", "document_type": "POH"}]}
    else:
        def boom(aircraft_type=None, **k):
            raise RuntimeError("mock documents outage")
        docs.get_library_reference = boom


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_happy_path_never_null():
    print("\n[1] happy path — all tools ok => COMPLETE, never null")
    patch_all()
    ctx = make_ctx()
    result = asyncio.run(orchestrator.run_briefing(ctx, include_videos=True))
    check("result is not None", result is not None)
    check("status complete", result.status == BriefingStatus.COMPLETE,
          f"got {result.status}")
    ids = {s.section_id for s in result.sections}
    expected = {"flight_overview", "day_night", "documents", "mass_balance",
                "aircraft_planning", "weather", "notams", "airport_departure",
                "airport_destination", "videos", "operational_considerations", "sources"}
    check("all 12 sections present", expected <= ids, f"missing {expected - ids}")
    check("no section is None", all(s is not None for s in result.sections))
    check("all sections ok", all(s.status == SectionStatus.OK for s in result.sections),
          f"statuses: {[ (s.section_id, s.status) for s in result.sections if s.status != SectionStatus.OK ]}")
    check("notice null on healthy primary", result.notice is None, f"got {result.notice!r}")
    text = orchestrator.build_result_text(result)
    check("assembled text non-empty", bool(text and text.strip()))
    check("text has ## headings", "## " in text)


def test_total_tool_failure_still_returns_result():
    print("\n[2] total data failure — every tool fails => FAILED status, still a result")
    patch_all(
        weather=failing_tool("weather down"),
        airport=failing_tool("airport down"),
        notams=failing_tool("notams down"),
        video=failing_video,
        narrative=failing_narrative,
        docs_ok=False,
    )
    ctx = make_ctx()
    try:
        result = asyncio.run(orchestrator.run_briefing(ctx, include_videos=True))
    except Exception as e:  # noqa: BLE001
        check("run_briefing did not raise", False, f"raised {e}")
        return
    check("result is not None", result is not None)
    check("status failed (0 ok data sections; overview/planning still ok so partial expected)",
          result.status in (BriefingStatus.FAILED, BriefingStatus.PARTIAL),
          f"got {result.status}")
    # deterministic sections (overview, day_night, mass_balance, planning) are OK
    ok_ids = {s.section_id for s in result.sections if s.status == SectionStatus.OK}
    check("deterministic sections survived", {"flight_overview", "day_night"} <= ok_ids,
          f"ok ids: {ok_ids}")
    failed = {s.section_id: s.error for s in result.sections if s.status == SectionStatus.FAILED}
    check("weather marked FAILED with error", "weather" in failed and failed["weather"],
          f"failed: {failed}")
    text = orchestrator.build_result_text(result)
    check("assembled text non-empty despite failures", bool(text and text.strip()))


def test_narrative_failure_never_blocks():
    print("\n[3] narrative LLM failure — briefing still completes")
    patch_all(narrative=failing_narrative)
    ctx = make_ctx()
    result = asyncio.run(orchestrator.run_briefing(ctx, include_videos=True))
    check("result is not None", result is not None)
    ops = next((s for s in result.sections if s.section_id == "operational_considerations"), None)
    check("ops section FAILED with error", ops is not None and ops.status == SectionStatus.FAILED
          and bool(ops.error), f"ops={ops}")
    data_ok = [s for s in result.sections if s.status == SectionStatus.OK]
    check("data sections still ok", len(data_ok) >= 8, f"ok count={len(data_ok)}")
    check("notice restored from fallback narrative", result.notice == "mock fallback notice",
          f"notice={result.notice!r}")


def test_cancellation_returns_partial():
    print("\n[4] cancellation — partial result with completed sections")
    patch_all()

    async def slow_weather(client, icao):
        await asyncio.sleep(0.3)
        return await ok_weather(client, icao)

    data_mod.fetch_metar_taf = slow_weather
    ctx = make_ctx()

    async def run_and_cancel():
        task = asyncio.create_task(orchestrator.run_briefing(ctx, include_videos=False))
        await asyncio.sleep(0.05)
        check("cancel flag accepted", orchestrator.request_cancel(ctx.generation_id))
        return await task

    result = asyncio.run(run_and_cancel())
    check("result is not None", result is not None)
    check("status partial after cancel", result.status == BriefingStatus.PARTIAL,
          f"got {result.status}")
    check("cancel notice present", bool(result.notice and "cancelled" in result.notice.lower()),
          f"notice={result.notice!r}")
    ok_ids = {s.section_id for s in result.sections if s.status == SectionStatus.OK}
    check("instant sections completed before cancel", "flight_overview" in ok_ids,
          f"ok: {ok_ids}")


def test_cancel_during_narrative_returns_partial():
    print("\n[4b] cancellation during narrative — short-circuits final COMPLETE")
    patch_all()

    async def slow_narrative(ctx, facts):
        await asyncio.sleep(0.4)
        return await ok_narrative(ctx, facts)

    orchestrator.build_narrative = slow_narrative
    ctx = make_ctx()

    async def run_and_cancel_mid_narrative():
        task = asyncio.create_task(orchestrator.run_briefing(ctx, include_videos=False))
        # Data mocks are instant; by 0.1s the run is inside the narrative sleep.
        await asyncio.sleep(0.1)
        check("cancel accepted during narrative", orchestrator.request_cancel(ctx.generation_id))
        return await task

    result = asyncio.run(run_and_cancel_mid_narrative())
    check("narrative-cancel result is not None", result is not None)
    check("narrative-cancel status partial (not COMPLETE)",
          result.status == BriefingStatus.PARTIAL, f"got {result.status}")
    check("narrative-cancel notice present",
          bool(result.notice and "cancelled" in result.notice.lower()),
          f"notice={result.notice!r}")
    check("narrative-cancel registry cleaned (second cancel is False)",
          orchestrator.request_cancel(ctx.generation_id) is False)


def test_sse_frames_terminal_and_wellformed():
    print("\n[5] SSE — frames well-formed, stream always terminal")
    patch_all()
    ctx_dict = {
        "message": "test", "departure": "LKLT", "destination": "LKKB",
        "aircraft_type": "Cessna 172", "rules": "VFR", "flight_period": "day",
    }

    async def collect():
        frames = []
        async for frame in orchestrator.stream_briefing(ctx_dict, include_videos=False):
            frames.append(frame)
        return frames

    frames = asyncio.run(collect())
    check("frames produced", len(frames) > 0)
    types = []
    for f in frames:
        check("frame starts with event:", f.startswith("event: "), f[:40])
        data_line = next((l for l in f.splitlines() if l.startswith("data: ")), None)
        check("frame has data line", data_line is not None)
        payload = json.loads(data_line[6:])
        types.append(payload.get("type"))
        check("payload has generation_id", bool(payload.get("generation_id")))
    check("has generation_started", "generation_started" in types, f"types={types}")
    check("terminal event present", "generation_completed" in types or "generation_failed" in types,
          f"types={types}")
    check("exactly one terminal event",
          types.count("generation_completed") + types.count("generation_failed") == 1,
          f"types={types}")


def test_missing_departure_rejected():
    print("\n[6] contract — missing departure raises ValidationError (API => 422)")
    try:
        BriefingRequest(message="hello")
        check("ValidationError raised", False, "no exception")
    except Exception as e:  # noqa: BLE001
        check("ValidationError raised", "departure" in str(e).lower(), str(e)[:120])


def test_video_only_from_verified():
    print("\n[7] videos — unverified/failed search => explicit unavailable, no fabricated cards")
    patch_all(video=failing_video)
    ctx = make_ctx()
    result = asyncio.run(orchestrator.run_briefing(ctx, include_videos=True))
    videos = next(s for s in result.sections if s.section_id == "videos")
    check("videos section present", videos is not None)
    check("videos unavailable (not ok with fake cards)",
          videos.status in (SectionStatus.UNAVAILABLE, SectionStatus.FAILED),
          f"status={videos.status}")
    video_blocks = [b for b in videos.blocks if b.get("type") == "video"]
    check("no video blocks when search failed", len(video_blocks) == 0,
          f"blocks={video_blocks}")


def main():
    print("Pre-flight v2 regression tests (offline, mocked)")
    print("=" * 60)
    test_happy_path_never_null()
    test_total_tool_failure_still_returns_result()
    test_narrative_failure_never_blocks()
    test_cancellation_returns_partial()
    test_cancel_during_narrative_returns_partial()
    test_sse_frames_terminal_and_wellformed()
    test_missing_departure_rejected()
    test_video_only_from_verified()
    print("\n" + "=" * 60)
    print(f"PASSED: {len(PASSED)}  FAILED: {len(FAILED)}")
    if FAILED:
        print("Failed checks:", FAILED)
        sys.exit(1)
    print("ALL PASS")


if __name__ == "__main__":
    main()
