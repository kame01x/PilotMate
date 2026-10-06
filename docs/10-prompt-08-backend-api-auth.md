# Prompt 8 — Backend API + Real Authentication

Paste this to opencode. This is a significant phase: it wraps everything built in Phases 1-7 in a real HTTP API and replaces the "trust whatever ID is passed in" pattern with real authentication, which is required before any frontend can safely talk to this app.

No new accounts or external services needed — this is all open-source libraries running locally, same as everything so far.

---

## Prompt to paste into opencode

```
This is Phase 8 of PilotMate: wrap the existing backend/agents logic in a real FastAPI HTTP API with real authentication, replacing the "caller supplies their own student_id/instructor_id" trust model used in the test scripts so far. This is a security-critical phase — read docs/01-architecture.md's full "Security principles" section again before starting, specifically "Student/instructor authentication must be real (not the toy plaintext demo pattern) before any real user data is stored" — that condition is now true, since a real HTTP API reachable by a browser is the thing being built.

Scope:

1. DEPENDENCIES
   - Add fastapi, uvicorn, passlib[bcrypt] (password hashing), python-jose[cryptography] or pyjwt (JWT), and python-multipart to the project. Explain your choice between python-jose and pyjwt before picking one.

2. AUTH DATA MODEL
   - Add whatever's needed to support login for both Student and Instructor — a hashed_password field on each (or a separate linked credentials table if that fits the existing schema style better; explain your choice). Never store plaintext passwords. Add email or a login identifier field if the existing Student ID/Instructor ID isn't suitable as a login username — explain your choice.
   - Signup endpoints: POST /auth/student/signup, POST /auth/instructor/signup — create the account with a securely hashed password.
   - Login endpoints: POST /auth/student/login, POST /auth/instructor/login — verify password, issue a JWT access token containing the authenticated identity (student_id or instructor_id) and role (student/instructor).
   - Add JWT_SECRET_KEY to .env (tell me to generate a real random one — don't hardcode a placeholder) and JWT_EXPIRY_MINUTES as a config var.

3. THE CORE SECURITY CHANGE — READ CAREFULLY
   - Every existing function in agents/ and backend/ that currently takes a student_id or instructor_id as a trusted parameter (because test scripts called it directly) must now, at the API layer, get that identity from the verified JWT token of the currently logged-in user — NEVER from a value the client puts in the request body or URL for "who am I." A FastAPI dependency (e.g. get_current_student, get_current_instructor) should decode and verify the JWT and reject invalid/missing/expired tokens with 401.
   - Where an endpoint needs to reference a DIFFERENT person (e.g. an instructor linking to or messaging a specific student by that student's ID, or a student directing which flight they mean), that target ID can still come from the request — that's normal and correct. What must change is: the ACTING identity (whose flight is this, who is sending this message, who is running this pre-flight session) comes from the authenticated token, period.
   - This means agents/instructor.py's assert_linked_student(instructor_id, student_id) is still exactly the right check — but the instructor_id argument it receives at the API layer must now be the authenticated instructor's ID from their token, never a client-supplied value. Audit every endpoint for this pattern specifically and tell me explicitly that you did this audit.

4. ENDPOINTS (wrap existing logic, don't rewrite agent internals)
   - Student: start/continue pre-flight session, start/continue technical agent session, start/continue debrief session, view own flight history, view own library access.
   - Instructor: link student by ID, send/read messages with a linked student, run pre-flight agent for a linked student.
   - Shared/public where appropriate: documentation library browsing (list_by_aircraft, list_general_reference) — reasonable to leave unauthenticated as read-only reference, or require login, your call — explain your choice.
   - Exam prep: list_sections / get_section.
   - All endpoints should return clean JSON, with proper HTTP status codes (401 for auth failures, 403 for authorization failures like an unlinked student, 404 for not-found, 422/400 for bad input).

5. CORS
   - Enable CORS for local frontend development (allow http://localhost:3000, the standard Next.js dev port). Explain how you'd tighten this for a real deployment later (specific origin, not wildcard).

6. SAFETY
   - Every safety notice/verification-required language already built into the agents (reference-data disclaimers, draft-labeled debrief observations, authority caveats) must pass through the API unchanged — don't let serialization drop or flatten those fields.

Follow the rules in AGENTS.md. Explain your architectural decisions before making them, especially the auth data model choice and the JWT library choice. After building, write a test script (using FastAPI's TestClient, not a live server) that: (a) signs up a student and instructor, (b) logs in and gets tokens, (c) uses the student token to run a pre-flight session for themselves, (d) uses the instructor token to link that student and send a message, (e) attempts to call a student-only endpoint using the instructor's token (or vice versa) and confirms it's rejected, (f) attempts to call any protected endpoint with no token / a garbage token and confirms 401. Show me all six outputs — (e) and (f) matter most, they're the actual security boundary.
```

---

## What to check once opencode finishes

- Does it actually explain and complete the audit from item 3 — every endpoint using the authenticated identity for "who's acting," not a client-supplied one?
- Do tests (e) and (f) show real rejections (401/403), not just happy-path success?
- Are passwords actually hashed (bcrypt), never stored or logged in plaintext?
- Is `JWT_SECRET_KEY` a real generated secret in `.env` (gitignored, obviously), not a placeholder string left in code?
- Do the safety disclaimers/caveats from every earlier phase still show up intact in the API responses?

---

## What you'll need to do yourself (not opencode)

- Nothing external yet. No new accounts, no new platforms. Once this is built, you'll run the API locally with `uvicorn` and test it — I'll give you that command once you're ready.
- One thing worth deciding now for later: when you eventually deploy this for real (not local dev), you'll need a hosting account for the API (Railway, Render, Fly.io are common free-tier-friendly options) and the frontend (Vercel, which pairs naturally with Next.js). That's a Phase 10+ decision, not now — just flagging it so it's not a surprise.

Once Phase 8 is confirmed working — especially those rejection tests — we move to **Phase 9: the Next.js frontend**, built directly by opencode (Next.js + Tailwind + shadcn/ui), talking to this real authenticated API.
