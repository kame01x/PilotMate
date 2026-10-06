"""Phase 8b test: (a) pre-flight intent routed correctly, (b) technical intent,
(c) ambiguous intent triggers clarify, (d) existing direct scripts still pass."""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.router_agent import RouterAgent


def show(label: str, text: str) -> None:
    print(f"\n### ({label}) {text}\n")


def main() -> None:
    router = RouterAgent("STU-0001")

    show("a", "clearly pre-flight intent")
    r = router.chat("Can you get the weather and NOTAM situation for my KSQL flight tomorrow?")
    print("intent:", r["intent"], "| confidence:", r["confidence"], "| routed_to:", r["routed_to"])
    print(str(r["response"])[:250])

    show("b", "clearly technical intent")
    r = router.chat("Explain what really happens aerodynamically when a wing stalls.")
    print("intent:", r["intent"], "| confidence:", r["confidence"], "| routed_to:", r["routed_to"])
    print(str(r["response"])[:250])

    show("c", "genuinely ambiguous -> must clarify, not guess")
    r = router.chat("What should I expect for my stall exercise tomorrow?")
    print("intent:", r["intent"], "| confidence:", r["confidence"], "| routed_to:", r["routed_to"])
    print(str(r["response"])[:400])

    show("d", "existing direct scripts unchanged")
    for script in ("test_preflight.py", "test_technical.py", "test_debrief.py"):
        proc = subprocess.run(
            [sys.executable, f"scripts/{script}"],
            capture_output=True, text=True, timeout=1800,
            env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"},
        )
        tail = (proc.stdout or "").strip().splitlines()[-3:]
        print(f"{script}: exit={proc.returncode} | last lines:")
        for line in tail:
            print("   ", line[:120])


if __name__ == "__main__":
    main()
