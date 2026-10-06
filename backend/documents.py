"""Documentation library (Part 3 v1): structured browsing over reference documents.
Reference-only data — real official sources, no fabricated content, no LLM generation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.models import Document

CURRENCY_NOTICE = (
    "Reference entry only — verify the current official version and applicability "
    "against the source before use. This library does not cache certified content."
)

STARTER_DOCUMENTS = [
    # Cessna 172 — aircraft-specific references actually used elsewhere in the app
    {
        "title": "Cessna 172 POH / AFM (serial-specific)",
        "category": "aircraft",
        "aircraft_type": "Cessna 172",
        "document_type": "POH",
        "file_reference": "Obtain from your aircraft operator/flight school or Textron Aviation",
        "source": "Textron Aviation (Cessna) — not publicly redistributable",
        "currency_notice": CURRENCY_NOTICE + " Always use the manual for YOUR aircraft's tail number.",
    },
    {
        "title": "Cessna 172 Checklist (operator/manufacturer)",
        "category": "aircraft",
        "aircraft_type": "Cessna 172",
        "document_type": "checklist",
        "file_reference": "Obtain from your aircraft operator or the approved AFM/POH supplement",
        "source": "Aircraft operator / manufacturer AFM supplement",
        "currency_notice": CURRENCY_NOTICE,
    },
    {
        "title": "Cessna 172 Weight & Balance sheet (current, tail-specific)",
        "category": "aircraft",
        "aircraft_type": "Cessna 172",
        "document_type": "weight_and_balance",
        "file_reference": "Obtain from your aircraft operator (kept with the aircraft records)",
        "source": "Aircraft operator",
        "currency_notice": CURRENCY_NOTICE + " W&B is invalid unless it reflects the exact aircraft.",
    },
    # General reference section (the four named in the architecture doc)
    {
        "title": "AIP — Aeronautical Information Publication",
        "category": "general",
        "aircraft_type": None,
        "document_type": "AIP reference",
        "file_reference": "FAA Digital Products / Chart Supplement: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/",
        "source": "FAA Aeronautical Navigation Products",
        "currency_notice": CURRENCY_NOTICE + " AIRAC cycle must match your flight.",
    },
    {
        "title": "ICAO Doc 8400 — Procedures for Air Navigation Services (PANS-ATM)",
        "category": "general",
        "aircraft_type": None,
        "document_type": "ICAO Doc 8400",
        "file_reference": "ICAO document store: https://www.icao.int/store",
        "source": "International Civil Aviation Organization",
        "currency_notice": CURRENCY_NOTICE,
    },
    {
        "title": "Radiotelephony Phraseology — ICAO Doc 9432",
        "category": "general",
        "aircraft_type": None,
        "document_type": "phraseology",
        "file_reference": "ICAO document store: https://www.icao.int/store",
        "source": "International Civil Aviation Organization",
        "currency_notice": CURRENCY_NOTICE,
    },
    {
        "title": "Chart Legend / User's Guide (VFR charts)",
        "category": "general",
        "aircraft_type": None,
        "document_type": "chart legend",
        "file_reference": "FAA VFR Chart User's Guide: https://www.faa.gov/air_traffic/flight_info/aeronav/charts/",
        "source": "FAA Aeronautical Navigation Products",
        "currency_notice": CURRENCY_NOTICE + " Chart sectional editions expire every 6 months.",
    },
    {
        "title": "FAA Airplane Flying Handbook (AFH)",
        "category": "general",
        "aircraft_type": None,
        "document_type": "POH",
        "file_reference": "FAA aviation handbooks: https://www.faa.gov/training_testing/training/aviation_handbooks/",
        "source": "FAA",
        "currency_notice": CURRENCY_NOTICE,
    },
]


def _row_to_dict(d: Document) -> dict:
    return {
        "id": d.id,
        "title": d.title,
        "category": d.category,
        "aircraft_type": d.aircraft_type,
        "document_type": d.document_type,
        "file_reference": d.file_reference,
        "source": d.source,
        "currency_notice": d.currency_notice,
    }


def seed_library() -> int:
    session = SessionLocal()
    try:
        if session.query(Document).count() > 0:
            return 0
        for item in STARTER_DOCUMENTS:
            session.add(Document(**item))
        session.commit()
        return len(STARTER_DOCUMENTS)
    finally:
        session.close()


def list_by_aircraft(aircraft_type: str) -> list[dict]:
    session = SessionLocal()
    try:
        rows = session.query(Document).filter_by(category="aircraft", aircraft_type=aircraft_type).all()
        return [_row_to_dict(r) for r in rows]
    finally:
        session.close()


def list_general_reference() -> list[dict]:
    session = SessionLocal()
    try:
        rows = session.query(Document).filter_by(category="general").all()
        return [_row_to_dict(r) for r in rows]
    finally:
        session.close()


def get_document(document_id: int) -> dict | None:
    session = SessionLocal()
    try:
        row = session.query(Document).filter_by(id=document_id).first()
        return _row_to_dict(row) if row else None
    finally:
        session.close()


def get_library_reference(aircraft_type: str | None = None,
                          document_type: str | None = None,
                          category: str | None = None) -> dict:
    session = SessionLocal()
    try:
        q = session.query(Document)
        if category:
            q = q.filter_by(category=category)
        if aircraft_type:
            q = q.filter_by(aircraft_type=aircraft_type)
        if document_type:
            q = q.filter(Document.document_type == document_type)
        rows = q.all()
        if not rows:
            return {"error": "No matching library entry found.", "notice": CURRENCY_NOTICE}
        return {
            "documents": [_row_to_dict(r) for r in rows],
            "notice": "Cite the real entry; verify currency against the official source before use.",
        }
    finally:
        session.close()
