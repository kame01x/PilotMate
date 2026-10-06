"""Phase 7 test: all three exam-prep sections return the honest placeholder."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.exam_prep import get_section, list_sections

for name in list_sections():
    print(get_section(name))
print(get_section("Instrument Rating"))  # unknown section handled gracefully
