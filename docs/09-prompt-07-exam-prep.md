# Prompt 7 — Exam Prep Placeholders (Part 4)

Paste this to opencode. This is the final piece of the v1 scope in docs/01-architecture.md — Part 4 (Exam prep), which is explicitly a placeholder-only phase.

---

## Prompt to paste into opencode

```
This is Phase 7 of PilotMate: Part 4 — Exam Prep, v1 scope per docs/01-architecture.md. Read the "Part 4 — Exam prep (v1 scope)" section again — it's intentionally minimal: three buttons (PPL, ATPL, Know Your Aircraft), each showing "Under construction," structure only, no real content yet.

Build this as a small, honest placeholder — don't over-build it:

1. Add a simple structure (e.g. backend/exam_prep.py, or just entries in whatever routing/button structure the app's frontend will eventually use) representing the three sections: PPL, ATPL, Know Your Aircraft.
2. Each one returns/displays a clear "Under construction" message — no fake content, no partial quiz questions, no placeholder Lorem-ipsum-style text pretending to be real exam material. The whole point of this phase is to reserve the spot honestly, not simulate a feature that doesn't exist.
3. Do not call the Gemini model or any other API for this phase — there's nothing to generate yet, and generating placeholder exam content would risk it being mistaken for real material later.
4. If there's an existing routing/button convention from Part 1/Part 2's structure (even if PilotMate doesn't have a real frontend yet and this is just backend stubs), follow that same convention for consistency rather than inventing a new pattern just for this phase.

Follow the rules in AGENTS.md. Explain your approach before building — this should be a very short, low-risk addition. After building, write a tiny test script showing all three sections return their "under construction" placeholder correctly, and confirm no new dependencies or API keys were needed.
```

---

## What to check once opencode finishes

- Is it genuinely just a placeholder — no invented exam content, no quiz questions, nothing that could be mistaken for real PPL/ATPL material?
- Did it avoid calling any model or API for this (there's no reason to)?
- Is it consistent with how the rest of the app is structured, rather than a one-off pattern?

---

## You've now completed the full v1 scope

Per docs/01-architecture.md, that's all four parts:
- **Part 1 (Student):** Pre-flight Agent, Technical Agent, Debrief Agent — all working against a real database, with live weather/airport/NOTAM data, authority-aware coaching, and draft-labeled (not verdict) feedback
- **Part 2 (Instructor):** student linking with enforced authorization, instructor messaging, reused Pre-flight Agent access
- **Part 3 (Documentation library):** real sourced references, integrated into the agents
- **Part 4 (Exam prep):** honest placeholders

Plus the infrastructure layer underneath: a shared Gemini client with retry/backoff and an automatic local-Ollama fallback, a security-conscious `.gitignore`/`.env` setup, and STRIDE-aware authorization boundaries where it mattered (Instructor ↔ Student).

What's realistically next, worth thinking about deliberately rather than just continuing to build:
- **A real frontend** — everything so far is backend/agent logic exercised through test scripts. Per your own roadmap (Phase 4), this is the natural next phase, and it's worth deciding now: a quick prototype UI (e.g. Streamlit) to actually use the app hands-on, vs. jumping straight to a proper web frontend.
- **Real authentication** — the architecture doc's security principles flagged this as required "before any real user data is stored." Everything built so far uses test Student/Instructor IDs; this matters before anyone but you touches it.
- **Testing phases 5 (Phase 2 style, adversarial/edge-case input)** — none of the test scripts so far have tried to break anything (vague input, prompt injection attempts, tool failures). Worth doing deliberately before this goes anywhere near real users.

Want to tackle the frontend next, or go back and harden what's built (auth + adversarial testing) before adding more surface area?
