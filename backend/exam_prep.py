"""Part 4 — Exam prep (v1): honest placeholder structure only.
Three sections reserved. No content, no model calls, no external APIs."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SECTIONS = {
    "PPL": "Under construction — Private Pilot exam prep is planned for a later phase.",
    "ATPL": "Under construction — ATPL exam prep is planned for a later phase.",
    "Know Your Aircraft": "Under construction — Know Your Aircraft section is planned for a later phase.",
}


def list_sections() -> list[str]:
    return list(SECTIONS)


def get_section(name: str) -> dict:
    if name not in SECTIONS:
        return {"error": f"Unknown exam prep section: {name}", "sections": list_sections()}
    return {"title": name, "status": "under_construction", "message": SECTIONS[name]}
