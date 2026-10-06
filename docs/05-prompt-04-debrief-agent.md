# Prompt 4 — Debrief Agent

Paste this to opencode as your next build instruction. This builds the Debrief Agent as specified in docs/01-architecture.md, on top of the Phase 1-3 foundation (database, Pre-flight Agent, Technical Agent).

---

## Prompt to paste into opencode

```
This is Phase 4 of PilotMate: the Debrief Agent. Read docs/01-architecture.md for full context before starting, and build on the existing backend/models.py, database, agents/gemini_chat.py (shared Gemini client/tool-loop), agents/preflight_agent.py, and agents/technical_agent.py — reuse the shared module, don't duplicate it.

Build the Debrief Agent in agents/debrief_agent.py, with the following behavior:

1. CONVERSATION FLOW
   - The Debrief Agent is reached after a flight, tied to a specific Flight record. Before asking anything, it reads: the PreflightPackage for that flight (what exercise was planned, what was briefed), and the TechnicalLog rows for that student/flight from Phase 3 (what was covered beforehand — remember a single technical session may have produced multiple log rows; treat them as one group per topic, not as separate independent events).
   - It then asks the student a short series of open conversational questions about how the flight actually went: how the planned exercise(s) went, what felt difficult, what they'd do differently, anything unplanned that came up. Keep it conversational, not a rigid form — follow-up questions are fine when something the student says is worth digging into.
   - Throughout, the agent stays in a coaching/reflective register: it can reflect back patterns it notices in what the student says, but it must not present itself as issuing a performance verdict or diagnosing the student (no clinical or absolute language like "you have a deficiency in X") — this mirrors the human-in-the-loop principle from Phase 2/3: the agent surfaces observations, the instructor (human) is the one who makes authoritative judgments. In v1 there is no live instructor in this flow, so the agent's "identified weak points" output must be framed as draft/suggested observations for a future instructor to confirm, not final assessments.

2. OUTPUT
   - At the end of the conversation, compile and save a Debrief record (add/use the Debrief model from docs/01-architecture.md's schema in backend/models.py if it doesn't already exist, matching the existing style) with: student_id, flight_id, student_reported_feedback (the student's own words/summary), agent_conversation_log (structured, not raw dump — similar spirit to Phase 3's TechnicalLog), identified_weak_points (draft/suggested, clearly labeled as such), coaching_notes (constructive, actionable suggestions tied to what was actually discussed). Leave instructor_notes null/empty — that's for the future instructor integration described in the architecture doc, not built in v1.
   - Pull in relevant context from the pre-flight and technical logs where it helps ground the debrief (e.g. "you mentioned being unsure about X before the flight — how did that go?"), but don't just mechanically repeat them back.

3. INSTRUCTOR CHAT PLACEHOLDER
   - Per docs/01-architecture.md, the Instructor Chat is only reachable from the Debrief flow and is a v1 placeholder — implement just enough structure (e.g. a stub function or clearly marked TODO with the InstructorMessage model referenced) to show where it plugs in later, without building real instructor-side functionality now. Explain what you stubbed and why.

4. SAFETY AND VERIFICATION
   - Same human-in-the-loop principle as before: this agent coaches and reflects, it does not deliver final verdicts. "Identified weak points" must be clearly labeled in both the data and any output shown to the student as draft/suggested, pending instructor review — never phrased as a confirmed diagnosis of the student.
   - Do not speculate about why a student struggled with something beyond what they actually told the agent — ground coaching notes in what was said, not inferred psychology.

5. MODEL
   - Use the same Gemini model, shared client, and .env pattern as Phases 2-3. No new API keys should be needed for this agent — if you find you need one, stop and tell me what it's for before proceeding with that part.

Follow the rules in AGENTS.md. Explain any architectural decisions before making them, especially the Debrief model (if new) and the instructor-chat stub. After building, write a simple test script that simulates a full debrief conversation for the test flight from Phases 2-3 (reading its real PreflightPackage and TechnicalLog data), and show me the output — including the final saved Debrief record.
```

---

## What to check once opencode finishes

- Does it actually read and use the Phase 2 PreflightPackage and Phase 3 TechnicalLog data for that flight, rather than starting the debrief cold?
- Does it correctly treat multiple TechnicalLog rows from one session as a single prior topic, not as separate disconnected events?
- Is "identified weak points" clearly labeled as draft/suggested for instructor review — not phrased as a confirmed verdict anywhere in the saved record or the conversation?
- Does the coaching stay grounded in what the student actually said, without inventing psychological explanations for why they struggled?
- Is the Instructor Chat stub clearly marked as a placeholder, not a half-built feature that looks functional but isn't?
- Does the test script show a full conversation and the final Debrief record with all fields populated sensibly?

Once confirmed working, commit this checkpoint. At this point Part 1 (Student: pre-flight, technical, debrief) is functionally complete end-to-end — the natural next step is either Part 2 (Instructor) or Part 3 (Documentation library), depending on which you want to tackle next.
