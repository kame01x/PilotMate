"""Phase 6 test: (a) list Cessna 172 docs, (b) list general reference, (c) full
metadata for one document, (d) Technical Agent stall session now cites a REAL
library entry via get_library_reference."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.documents import get_document, list_by_aircraft, list_general_reference, seed_library


def main() -> None:
    seed_library()

    print("=== (a) Documents for Cessna 172 ===")
    for d in list_by_aircraft("Cessna 172"):
        print(f"  - [{d['document_type']}] {d['title']} | source: {d['source']}")

    print("\n=== (b) General reference section ===")
    for d in list_general_reference():
        print(f"  - [{d['document_type']}] {d['title']} | source: {d['source']}")

    print("\n=== (c) Full metadata for one document ===")
    first = list_general_reference()[0] if list_general_reference() else None
    if first:
        print(json.dumps(get_document(first["id"]), indent=2, ensure_ascii=False))

    print("\n=== (d) Technical Agent 'stall' — cites a real library entry ===\n")
    from agents.technical_agent import TechnicalAgent

    agent = TechnicalAgent("STU-0001")
    print(agent.start_exercise("stall"))


if __name__ == "__main__":
    main()
