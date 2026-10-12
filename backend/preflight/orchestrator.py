"""Pre-flight orchestrator — concurrent, cancellable, event-streaming.

Design rules (these are the regression guarantees):
- Every section is always produced with an explicit status; no section is None.
- The final BriefingResult is always produced on success paths; HTTP 200 never
  carries a null response.
- Data tasks run concurrently; the narrative task runs after data completes.
- Cancellation: the orchestrator checks a per-generation asyncio.Event between
  stages and returns a PARTIAL result for whatever finished.
- Provider notice from the narrative model is restored onto the result
  (null when the primary provider served).
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Callable

import httpx

from backend.preflight import data as aviation_data
from backend.preflight.contracts import (
    BriefingResult,
    BriefingSection,
    BriefingStatus,
    FlightContext,
    SectionStatus,
    StreamEvent,
    new_generation_id,
)
from backend.preflight.narrative import build_narrative
from backend.preflight.specialists import (
    build_aircraft_planning,
    build_airport,
    build_day_night,
    build_documents,
    build_mass_balance,
    build_notams,
    build_overview,
    build_sources,
    build_videos,
    build_weather,
)

# Cancellation registry: generation_id -> Event (set => cancel).
_CANCEL: dict[str, asyncio.Event] = {}


def request_cancel(generation_id: str) -> bool:
    ev = _CANCEL.get(generation_id)
    if ev is None:
        return False
    ev.set()
    return True


def _is_cancelled(ctx: FlightContext) -> bool:
    ev = _CANCEL.get(ctx.generation_id)
    return bool(ev and ev.is_set())


def _final_status(sections: list[BriefingSection]) -> BriefingStatus:
    if not sections:
        return BriefingStatus.FAILED
    ok = sum(1 for s in sections if s.status == SectionStatus.OK)
    if ok == 0:
        return BriefingStatus.FAILED
    if any(s.status != SectionStatus.OK for s in sections):
        return BriefingStatus.PARTIAL
    return BriefingStatus.COMPLETE


def _assemble_text(ctx: FlightContext, result: BriefingResult) -> str:
    """Plain-text assembly with the legacy `##` headings for the JSON endpoint
    and any consumers that still parse markdown-ish text."""
    lines = [f"# Pre-flight briefing — {ctx.departure}"
             + (f" to {ctx.destination}" if ctx.destination else "")]
    lines.append(f"Status: {result.status.value}")
    if result.notice:
        lines.append(f"Notice: {result.notice}")
    for s in result.sections:
        lines.append(f"\n## {s.title}")
        if s.status == SectionStatus.FAILED:
            lines.append(f"[Data unavailable — {s.error or 'provider error'}]")
        elif s.status == SectionStatus.UNAVAILABLE and not s.blocks:
            lines.append("[No data available for this section]")
        for block in s.blocks:
            t = block.get("type")
            if t == "paragraph":
                lines.append(block.get("text", ""))
            elif t == "heading":
                lines.append(f"\n### {block.get('text', '')}")
            elif t in ("bullets", "numbered"):
                lines.extend(f"- {i}" for i in block.get("items", []))
            elif t == "kv":
                lines.extend(f"- {r.get('label')}: {r.get('value')}" for r in block.get("rows", []))
            elif t == "code":
                lines.append(block.get("text", ""))
            elif t == "warning":
                lines.append(f"WARNING: {block.get('text', '')}")
            elif t == "video":
                lines.append(f"- Video: {block.get('title')} — {block.get('url')}")
    return "\n".join(lines)


async def run_briefing(
    ctx: FlightContext,
    on_event: Callable[[StreamEvent], None] | None = None,
    include_videos: bool = True,
) -> BriefingResult:
    """Run the full pipeline. Always returns a BriefingResult (never raises for
    section-level failures; raises only if the pipeline itself is broken)."""
    cancel_event = _CANCEL.setdefault(ctx.generation_id, asyncio.Event())
    sections: list[BriefingSection] = []

    def emit(event: StreamEvent) -> None:
        if on_event:
            try:
                on_event(event)
            except Exception:  # noqa: BLE001 — event sink must never kill the run
                pass

    def add(section: BriefingSection) -> None:
        sections.append(section)
        emit(StreamEvent(
            type=("section_completed" if section.status == SectionStatus.OK
                  else "section_unavailable" if section.status == SectionStatus.UNAVAILABLE
                  else "section_failed"),
            generation_id=ctx.generation_id,
            section_id=section.section_id,
            section=section,
        ))

    emit(StreamEvent(type="generation_started", generation_id=ctx.generation_id))
    provider_notice: str | None = None

    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        icaos = [ctx.departure] + ([ctx.destination] if ctx.destination else [])

        async def weather_task():
            emit(StreamEvent(type="section_started", generation_id=ctx.generation_id, section_id="weather"))
            return build_weather(ctx, await aviation_data.fetch_metar_taf(client, ctx.departure))

        async def airport_task(icao: str, role: str):
            emit(StreamEvent(type="section_started", generation_id=ctx.generation_id, section_id=f"airport_{role}"))
            return build_airport(ctx, icao, role, await aviation_data.fetch_airport(client, icao))

        async def notams_task():
            emit(StreamEvent(type="section_started", generation_id=ctx.generation_id, section_id="notams"))
            return build_notams(ctx, icaos, await aviation_data.fetch_notams(client, ctx.departure))

        async def videos_task():
            emit(StreamEvent(type="section_started", generation_id=ctx.generation_id, section_id="videos"))
            topics = [f"{ctx.aircraft_type or 'private pilot'} {e}" for e in (ctx.exercises or ["pre-flight planning"])]
            results = await asyncio.gather(
                *[aviation_data.find_verified_video(t) for t in topics[:2]], return_exceptions=True
            )
            clean = [r for r in results if not isinstance(r, BaseException)]
            return build_videos(clean)

        # Instant deterministic sections (no I/O) — emit immediately.
        add(build_overview(ctx))
        add(build_day_night(ctx))
        add(build_documents(ctx))
        add(build_mass_balance(ctx))
        add(build_aircraft_planning(ctx))

        # Concurrent I/O sections — with cancel polling so a user cancel stops
        # pending tasks instead of waiting for all of them to finish.
        task_map: dict[asyncio.Task, str] = {}
        t_weather = asyncio.create_task(weather_task())
        task_map[t_weather] = "weather"
        t_notams = asyncio.create_task(notams_task())
        task_map[t_notams] = "notams"
        t_dep = asyncio.create_task(airport_task(ctx.departure, "departure"))
        task_map[t_dep] = "airport_departure"
        tasks = [t_weather, t_notams, t_dep]
        if ctx.destination:
            t_dest = asyncio.create_task(airport_task(ctx.destination, "destination"))
            task_map[t_dest] = "airport_destination"
            tasks.append(t_dest)
        if include_videos:
            t_videos = asyncio.create_task(videos_task())
            task_map[t_videos] = "videos"
            tasks.append(t_videos)

        gather_future = asyncio.gather(*tasks, return_exceptions=True)
        while not gather_future.done():
            if _is_cancelled(ctx):
                for t in tasks:
                    t.cancel()
                break
            await asyncio.sleep(0.05)
        results = await gather_future

        for task, r in zip(tasks, results):
            if isinstance(r, asyncio.CancelledError):
                # Task stopped by user cancel — no section, noted in the
                # final result's cancel notice; never a silent null.
                continue
            if isinstance(r, BaseException):
                # Should not happen (specialists capture their own errors), but
                # if a task explodes, surface it as a failed section — never null.
                add(BriefingSection(
                    section_id=task_map.get(task, "pipeline"),
                    title=task_map.get(task, "Pipeline"),
                    status=SectionStatus.FAILED, error=f"{type(r).__name__}: {r}",
                ))
            else:
                add(r)

        if _is_cancelled(ctx):
            # Cancelled => the briefing is incomplete by definition (some
            # sections never ran). Never report COMPLETE after a cancel.
            status = BriefingStatus.PARTIAL if any(
                s.status == SectionStatus.OK for s in sections
            ) else BriefingStatus.FAILED
            result = BriefingResult(
                generation_id=ctx.generation_id, status=status, context=ctx, sections=sections,
                notice="Generation cancelled by user — partial briefing returned.",
            )
            emit(StreamEvent(type="generation_completed", generation_id=ctx.generation_id,
                              status=result.status, counts=result.summary()))
            _CANCEL.pop(ctx.generation_id, None)
            return result

        # Narrative LLM (optional enrichment) — facts limited to fetched data.
        facts = {
            "weather": next((s.model_dump() for s in sections if s.section_id == "weather"), {}),
            "notams": next((s.model_dump() for s in sections if s.section_id == "notams"), {}),
            "departure_airport": next((s.model_dump() for s in sections if s.section_id == "airport_departure"), {}),
            "destination_airport": next((s.model_dump() for s in sections if s.section_id == "airport_destination"), {}),
        }
        emit(StreamEvent(type="section_started", generation_id=ctx.generation_id,
                         section_id="operational_considerations"))
        narrative_section, provider_notice = await build_narrative(ctx, facts)
        add(narrative_section)

        if _is_cancelled(ctx):
            # Cancel can arrive during the (up to 90s) narrative call, which is
            # not covered by the gather-stage poll loop. Honour it here so an
            # API-only cancel still short-circuits the final COMPLETE result.
            status = BriefingStatus.PARTIAL if any(
                s.status == SectionStatus.OK for s in sections
            ) else BriefingStatus.FAILED
            result = BriefingResult(
                generation_id=ctx.generation_id, status=status, context=ctx, sections=sections,
                notice="Generation cancelled by user — partial briefing returned.",
            )
            emit(StreamEvent(type="generation_completed", generation_id=ctx.generation_id,
                              status=result.status, counts=result.summary()))
            _CANCEL.pop(ctx.generation_id, None)
            return result

    add(build_sources(ctx, sections))
    status = _final_status(sections)
    result = BriefingResult(
        generation_id=ctx.generation_id, status=status, context=ctx, sections=sections,
        notice=provider_notice,
    )
    emit(StreamEvent(type="generation_completed", generation_id=ctx.generation_id,
                     status=result.status, counts=result.summary()))
    _CANCEL.pop(ctx.generation_id, None)
    return result


async def stream_briefing(
    request_dict: dict,
    include_videos: bool = True,
) -> AsyncIterator[str]:
    """Async generator yielding SSE frames. Used by the API layer."""
    from backend.preflight.contracts import BriefingRequest

    req = BriefingRequest(**request_dict)
    ctx = FlightContext.from_request(req, new_generation_id())
    queue: asyncio.Queue[StreamEvent | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def on_event(event: StreamEvent) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, event)

    async def runner():
        try:
            result = await run_briefing(ctx, on_event=on_event, include_videos=include_videos)
            # generation_completed already emitted with the result attached
            return result
        except Exception as exc:  # noqa: BLE001 — pipeline error => explicit event
            emit_fail = StreamEvent(
                type="generation_failed", generation_id=ctx.generation_id,
                error=f"{type(exc).__name__}: {exc}",
            )
            loop.call_soon_threadsafe(queue.put_nowait, emit_fail)
            return None
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    task = asyncio.create_task(runner())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item.to_sse()
    finally:
        if not task.done():
            request_cancel(ctx.generation_id)
            task.cancel()


def build_result_text(result: BriefingResult) -> str:
    return _assemble_text(result.context, result)


# Legacy-compatible entry used by /student/preflight (JSON endpoint).
async def run_briefing_json(request_dict: dict, include_videos: bool = True) -> BriefingResult:
    from backend.preflight.contracts import BriefingRequest

    req = BriefingRequest(**request_dict)
    ctx = FlightContext.from_request(req, new_generation_id())
    return await run_briefing(ctx, include_videos=include_videos)
