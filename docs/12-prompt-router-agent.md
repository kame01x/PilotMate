# Prompt 8b — Router Agent (fills the gap before the frontend)

Paste this to opencode before Phase 9 (frontend). This builds the "Main Router Agent" described in docs/01-architecture.md's agent diagram — free-form chat that classifies intent and routes to the right specialist — which Phases 1-8 never actually built (only direct, explicit calls to each specialist agent exist today).

---

## Prompt to paste into opencode

```
This is Phase 8b of PilotMate: the Main Router Agent, per the agent diagram in docs/01-architecture.md ("free-form chat → router agent classifies intent (pre-flight / technical / debrief) → specialist agent; buttons bypass the router, call the specialist directly"). This was never actually built in Phases 1-8 — every existing test script and API endpoint calls a specific agent directly. Build it now, on top of the existing agents/preflight_agent.py, technical_agent.py, debrief_agent.py, and the shared agents/gemini_chat.py — reuse everything, don't duplicate agent logic.

Build this as agents/router_agent.py:

1. CLASSIFICATION
   - Given a free-form student message (and the student's context — do they have an active/recent flight, any in-progress session), classify intent into one of: pre_flight, technical, debrief, library, exam_prep, or unclear.
   - Use a lightweight classification call through the shared gemini_chat client (same model/fallback pattern as everything else) — don't build a second, separate LLM client for this.
   - This is a genuinely ambiguous decision point in several real cases (e.g. "what should I expect for my stall exercise tomorrow" could be technical prep or pre-flight planning). When genuinely ambiguous, do NOT guess — ask the student a short clarifying question or offer the 2-3 candidate options explicitly, consistent with the human-in-the-loop principle used everywhere else in this app. Do not silently pick the "most likely" interpretation and run with it if more than one is plausible.

2. ROUTING
   - Once intent is confident, hand off to the appropriate existing agent/function and return its response through the same interface the router itself exposes — the caller (API layer) shouldn't need to know whether a response came from the router's own classification turn or from a specialist it routed to.
   - library and exam_prep intents route to the existing backend/documents.py and backend/exam_prep.py lookups (no agent conversation needed there, they're just data).
   - Preserve each specialist's own session/conversation state as it already works today — the router is an entry point, not a replacement for direct access. Both paths (free-form via router, direct via button) must keep working.

3. API INTEGRATION
   - Add one new endpoint, e.g. POST /student/chat, that accepts free-form text from an authenticated student and goes through the router. The actor identity still comes from the authenticated JWT per Phase 8's rule — no change to that pattern. Existing direct endpoints (pre-flight, technical, debrief) stay exactly as they are; this is additive, not a replacement.

4. TRANSPARENCY
   - When the router hands off to a specialist, it's fine for that to be invisible/seamless to the student (that's the point of a router). But log or make available (e.g. in the response metadata) which specialist handled it, so anything built on top (debugging, the instructor view, future analytics) can see the actual routing decision — don't make it a black box even if the UI itself stays simple.

Follow the rules in AGENTS.md. Explain your classification approach before building (single LLM call with a structured output, or something else — your call, explain it). After building, write a test script showing: (a) a clearly pre-flight-intent message routed correctly, (b) a clearly technical-intent message routed correctly, (c) a genuinely ambiguous message that correctly triggers a clarifying question instead of a guess, (d) confirm the existing direct-access test scripts (test_preflight.py, test_technical.py, test_debrief.py) still pass unchanged. Show me all four.
```

---

## What to check once opencode finishes

- Does test (c) actually show a clarifying question for a genuinely ambiguous message, not a confident guess dressed up as one?
- Do all three existing direct-access test scripts still pass — confirming the router is additive, not a disruptive rewrite?
- Is the routing decision visible somewhere (not just a silent black-box hop), per item 4?
- Did it reuse the shared Gemini client rather than spinning up a second one?

---

## What this changes about Phase 9 (frontend)

Once this is built, go back to the Phase 9 prompt I already gave you (`11-prompt-09-frontend.md`) and add one line before pasting it to opencode: tell it the router agent now exists at `POST /student/chat`, so the Student Dashboard CAN include a free-form chat entry point in addition to the specialist buttons — the gap that prompt explicitly worked around no longer exists. Everything else in that prompt stays the same.
