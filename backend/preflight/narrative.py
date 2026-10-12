"""Optional LLM interpretation section.

One constrained completion per briefing, run in a thread (provider layer is
sync). It receives ONLY the deterministic facts gathered by the data layer and
must output JSON: {operational_notes: [...], planning_notes: [...]} — no free
markdown. Failure here never blocks the briefing: the section is marked failed
and the deterministic sections stand on their own.
"""
from __future__ import annotations

import asyncio
import json
import re

from agents.gemini_chat import GeminiChat

from backend.preflight.contracts import (
    BriefingSection,
    FlightContext,
    SectionStatus,
    VERIFY_NOTICE,
)
from backend.preflight.specialists import bullets, paragraph, warning

NARRATIVE_SYSTEM_PROMPT = """You are PilotMate's flight-planning analyst.
You receive ONLY structured facts (form data + fetched METAR/TAF, airports,
NOTAM search results) for one pre-flight briefing. Output STRICT JSON only:
{"operational_notes": ["..."], "planning_notes": ["..."]}
Rules:
- 3-6 short bullet strings per list, plain text, no markdown, no headers.
- Use ONLY facts present in the input. Never invent weather, frequencies,
  runway data, NOTAMs, distances, or regulations.
- If a fact is missing, do not mention it.
- Operational notes: weather/NOTAM/airspace implications for this flight.
- Planning notes: concrete planning actions for this student pilot.
- End every bullet without a trailing period-stacking; keep it concise."""


def _extract_json(text: str) -> dict:
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except ValueError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _sync_narrative(user_payload: str) -> tuple[dict, str | None]:
    chat = GeminiChat(system_prompt=NARRATIVE_SYSTEM_PROMPT)
    raw = chat.chat(user_payload)
    data = _extract_json(raw)
    if not isinstance(data, dict):
        raise ValueError("narrative model returned non-object JSON")
    return data, chat.last_notice


def _facts_payload(ctx: FlightContext, facts: dict) -> str:
    lines = [
        f"Flight: {ctx.departure}" + (f" -> {ctx.destination}" if ctx.destination else ""),
        f"Aircraft: {ctx.aircraft_type or 'unspecified'} ({ctx.aircraft_registration or 'unregistered'})",
        f"Rules: {ctx.rules}; period: {ctx.flight_period}; date: {ctx.flight_date or 'unspecified'}",
        f"Exercises: {', '.join(ctx.exercises) or 'none listed'}",
        f"Route: {ctx.route or 'not provided'}",
        "Facts:",
    ]
    for key, value in facts.items():
        snippet = json.dumps(value, default=str)
        lines.append(f"- {key}: {snippet[:1200]}")
    return "\n".join(lines)


async def build_narrative(ctx: FlightContext, facts: dict) -> tuple[BriefingSection, str | None]:
    """Returns (section, provider_notice). Never raises."""
    try:
        data, notice = await asyncio.wait_for(
            asyncio.to_thread(_sync_narrative, _facts_payload(ctx, facts)), timeout=90
        )
    except asyncio.TimeoutError:
        return (
            BriefingSection(
                section_id="operational_considerations",
                title="Operational Considerations & Planning Notes",
                status=SectionStatus.FAILED,
                error="narrative model timed out (90s)",
            ),
            None,
        )
    except Exception as exc:  # noqa: BLE001
        return (
            BriefingSection(
                section_id="operational_considerations",
                title="Operational Considerations & Planning Notes",
                status=SectionStatus.FAILED,
                error=f"{type(exc).__name__}: {exc}",
            ),
            None,
        )
    ops = [s for s in (data.get("operational_notes") or []) if isinstance(s, str) and s.strip()]
    plans = [s for s in (data.get("planning_notes") or []) if isinstance(s, str) and s.strip()]
    if not ops and not plans:
        return (
            BriefingSection(
                section_id="operational_considerations",
                title="Operational Considerations & Planning Notes",
                status=SectionStatus.UNAVAILABLE,
                blocks=[paragraph("The analysis model returned no notes for this briefing. "
                                  "Use the deterministic sections above.")],
            ),
            notice,
        )
    blocks: list[dict] = []
    if ops:
        blocks.append({"type": "heading", "text": "Operational considerations"})
        blocks.append(bullets(ops))
    if plans:
        blocks.append({"type": "heading", "text": "Planning notes"})
        blocks.append(bullets(plans))
    blocks.append(warning(VERIFY_NOTICE))
    return (
        BriefingSection(
            section_id="operational_considerations",
            title="Operational Considerations & Planning Notes",
            status=SectionStatus.OK,
            blocks=blocks,
            notice=notice,
        ),
        notice,
    )
