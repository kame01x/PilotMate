# Prompt 5 — Instructor (Part 2)

Paste this to opencode as your next build instruction. This builds Part 2 (Instructor) as specified in docs/01-architecture.md, on top of the completed Part 1 (Student: Pre-flight, Technical, Debrief agents).

---

## Prompt to paste into opencode

```
This is Phase 5 of PilotMate: Part 2 — Instructor, v1 scope per docs/01-architecture.md. Read that doc again before starting, specifically the Instructor data entity, the InstructorMessage entity, and the "Part 2 — Instructor (v1 scope)" and "Security principles" sections. Build on the existing backend/models.py, database, agents/gemini_chat.py, and the Phase 1-4 agents — reuse shared code, don't duplicate it.

Build this in agents/instructor.py (or split into instructor_chat.py + student_linking.py if that's cleaner — your call, explain why), with the following v1 scope only:

1. STUDENT LINKING
   - A function/tool to link a student to an instructor by Student ID: validates the Student ID exists, sets the student's linked_instructor_id, and adds the student to the instructor's linked_students list.
   - This is a trust boundary: before this phase, nothing stopped one instructor's logic from touching another instructor's students, because there was no instructor-side access path at all. Now there is, so every instructor-facing function in this phase (chat, pre-flight access) MUST verify the target student_id is actually in that instructor's linked_students list before returning or acting on any student data. Treat an instructor querying an unlinked student as a rejected request, not an error to silently work around. Explain this check explicitly in your response — this is the STRIDE "information disclosure / spoofing" boundary flagged in the architecture doc's security principles, and it's the first time the codebase has multiple distinct human identities interacting, so get the boundary right even without full real authentication yet (that's still deferred per the architecture doc and Phase 2 security planning — don't build a real auth system in this phase, just don't skip the authorization check between already-identified instructor/student IDs).

2. INSTRUCTOR CHAT
   - A chat function where an instructor sends feedback/messages to one of their linked students (and can see that student's replies), using the existing InstructorMessage model (from_id, to_id, timestamp, message_text, read_status). This is NOT an AI agent conversation — it's instructor-to-student human messaging that the app stores and displays, so build the storage/retrieval functions (send_message, get_conversation(student_id, instructor_id), mark_read) rather than an LLM chat loop. Enforce the linked-student check from item 1 on every one of these functions.
   - This replaces the stub left in agents/debrief_agent.py's open_instructor_chat() — wire that stub to call into this real implementation now, and note that you did so.

3. PRE-FLIGHT AGENT ACCESS (REUSED)
   - Per the architecture doc, the instructor gets a button to access the Pre-flight Agent "same logic as Part 1, reused" — this means an instructor can run/review the Pre-flight Agent for one of their linked students' flights, not a reimplementation. Build a thin wrapper that: verifies the student is linked to this instructor, then calls the existing Pre-flight Agent logic from agents/preflight_agent.py for that student/flight. Do not copy or fork the Pre-flight Agent's code.

4. OUT OF SCOPE (confirm you're deferring these, don't build them)
   - Detailed reports, logbook generation, full student file view — the architecture doc explicitly defers these. Leave them out.

5. MODEL / KEYS
   - No new model calls needed for student linking or instructor chat (these are data operations, not AI conversations). No new API keys should be needed. If you find a reason one is, stop and tell me before proceeding with that part.

Follow the rules in AGENTS.md. Explain your architectural decisions before making them, especially how you structured the linked-student authorization check (ideally one shared helper function reused everywhere it's needed, not copy-pasted per function). After building, write a test script that: (a) links a student to an instructor by ID, (b) sends a message from instructor to student and reads it back, (c) attempts to access/message a student who is NOT linked to that instructor and confirms this is correctly rejected, (d) runs the Pre-flight Agent through the instructor's wrapper for the linked student's existing flight. Show me all four outputs, especially (c) — that's the one that actually matters for security.
```

---

## What to check once opencode finishes

- Is there one shared authorization check (e.g. `is_linked(instructor_id, student_id)`) used everywhere, rather than the check copy-pasted or — worse — missing in some function?
- Does test (c) actually demonstrate a rejected/denied access attempt for an unlinked student, not just a function that happens to return empty data?
- Does the Pre-flight Agent access genuinely reuse `agents/preflight_agent.py`'s logic rather than duplicating it?
- Is the instructor chat a real data-storage feature (not an LLM agent), matching what the architecture doc actually specifies?
- Did it leave out logbook generation, detailed reports, and full student file view as instructed, rather than quietly building partial versions?
- Did it wire the Phase 4 debrief stub to this real implementation, and mention doing so?

Once confirmed working, commit this checkpoint. That completes Part 2. The remaining pieces per the architecture doc are Part 3 (Documentation library) and Part 4 (Exam prep placeholders) — say the word and I'll send Prompt 6 for Part 3 next, continuing in order.
