# Prompt 9 — Frontend (Next.js + Tailwind + shadcn/ui)

Paste this to opencode. This builds the real frontend — the part you'll actually click around in — talking to the Phase 8 API (auth) and Phase 8b (router agent). No v0, no separate design tool: same stack v0 would generate, built directly.

---

## Prompt to paste into opencode

```
This is Phase 9 of PilotMate: build the frontend. Read docs/01-architecture.md again for the full picture of what each screen needs to do (Part 1 Student flow, Part 2 Instructor flow, Part 3 library, Part 4 exam-prep placeholders). The routing note in that doc — "free-form chat → router agent classifies intent; buttons bypass the router, call the specialist directly" — is now fully implemented on the backend (Phase 8b's RouterAgent, exposed at POST /student/chat). Build BOTH paths: a genuine free-form chat entry point calling the router, and direct specialist buttons that bypass it — exactly as the architecture doc describes, since both now exist for real.

Set up a new frontend/ folder inside the PilotMate project (keep it in the same repo for now) using Next.js (App Router), TypeScript, Tailwind CSS, and shadcn/ui components. This talks to the Phase 8 FastAPI backend (CORS is already configured for http://localhost:3000) via a base URL from NEXT_PUBLIC_API_URL in a .env.local file (default http://localhost:8000).

Build these screens:

1. AUTH
   - Landing/role-select page: choose Student or Instructor, then Login or Sign Up.
   - Signup and Login forms for each role, calling the Phase 8 /auth/* endpoints.
   - On login, store the JWT and use it for all subsequent requests. Store it in localStorage for now — explain in your response that this is acceptable for local dev/testing but should move to an httpOnly cookie set by the backend before any real deployment with real user data (same "flag it honestly" pattern as everywhere else in this app). Add a logout action that clears it.
   - A fetch wrapper/API client that attaches the token to every request and redirects to login on a 401.

2. STUDENT DASHBOARD
   - A simple nav/tab layout: Ask Anything (the router), Pre-flight, Technical, Debrief, Documentation Library, Exam Prep, Flight History.
   - "Ask Anything" tab: a single free-form chat box that posts to POST /student/chat. Display the response's classified intent and routed_to value visibly (small label, e.g. "Routed to: Technical Agent") so the student can see what handled their question — don't hide this as an implementation detail. When the router comes back with a clarify response (low confidence), render its options as clickable choices, not just plain text the student has to re-type a response to.
   - Pre-flight (direct button path): a form to start a session (departure airport, destination, route, aircraft type, exercise type, flight rules) feeding into a chat-style view showing the agent's responses — including the runway surface / controlled-status confirmation step, which must visibly require the student's explicit choice, never pre-filled or assumed. Weather/airport/NOTAM/mass-balance sections should render as clearly labeled cards with their source + verification notice visible, not buried.
   - Technical (direct button path): exercise-button entry (reuse exercise types already in the data model) plus its own free-form open-topic question box (this is the Technical Agent's existing open-topic path, separate from the router — both are fine to offer, they serve different purposes: this one's scoped to technical questions specifically, the router's "Ask Anything" is for when the student doesn't know which agent they need).
   - Debrief (direct button path): a chat view tied to a selected past flight, ending with a clearly-labeled "Draft — pending instructor review" section for identified weak points (never styled or worded as a final verdict).
   - Flight History: list of the student's own flights, newest first.
   - Documentation Library: browse by aircraft type + general reference, showing source and currency notice on every entry.
   - Exam Prep: the three placeholder buttons (PPL, ATPL, Know Your Aircraft), each showing the "under construction" message from the backend — don't invent extra UI polish that implies there's more here than there is.

3. INSTRUCTOR DASHBOARD
   - Link a student by Student ID (clear success/failure feedback — a clean error for "student not found" or "already linked," nothing cryptic).
   - Message thread view per linked student (send + read), using the real messaging endpoints.
   - A way to trigger the Pre-flight Agent for a linked student's flight, reusing the student-facing pre-flight view/component where reasonable rather than building a second one from scratch.
   - List of linked students.

4. SHARED UX RULES (carry the app's established principles into the UI, don't let them get lost in translation)
   - Any "[fallback] Gemini quota exhausted — using local Ollama..." notice from the backend must be visibly shown to the user in the chat UI, not swallowed — same transparency rule as the backend.
   - Every reference-data/safety disclaimer the backend sends (weather, NOTAM, mass & balance, authority caveats, draft-labeled debrief content) must render visibly, not get dropped during JSON → UI mapping.
   - If a specialist response via the router comes back as malformed/raw text (a known dev-grade quirk when the Ollama fallback's tool-calling degrades, per Phase 8b's caveat), render it as plain text gracefully rather than crashing the UI or showing a blank error.
   - Handle loading states and errors gracefully — no blank screens or raw JSON dumps on failure.

5. DESIGN
   - Clean, professional, aviation-appropriate (not garish) — use shadcn/ui's default component set and a simple neutral color scheme to start. Don't over-invest in custom styling yet; function and clarity first. I can give more specific visual direction later once I've seen it running.

Follow the rules in AGENTS.md. Explain your architectural decisions before building — project structure, state management approach (React context vs a library — keep it simple, don't add Redux for this), and the localStorage-vs-cookie tradeoff above. After building, tell me exactly how to run it (the two separate servers — backend and frontend — and the commands/ports for each) so I can open it in my browser and actually click through it myself.
```

---

## What to check once opencode finishes

- Does the "Ask Anything" router chat actually work end-to-end, including showing the clarify-with-options flow for an ambiguous question, not just the two confident-routing happy paths?
- Is the `routed_to` / classification decision visibly shown to the student, not hidden?
- Does the runway-surface/controlled-status confirmation step actually require explicit input, never a pre-filled default?
- Are safety disclaimers and the Ollama fallback notice actually visible in the UI, not dropped?
- Is debrief "weak points" content visually/textually distinguishable as draft, not styled like a final grade?
- Does it give you simple, exact run commands for both servers?

---

## What you do next (not opencode)

Once it's built, you'll run two things at once, in two separate terminal windows:

```powershell
# Terminal 1 — backend
cd "C:\Users\sofiane\Projects\PilotMate"
uv run uvicorn backend.api.main:app --reload

# Terminal 2 — frontend
cd "C:\Users\sofiane\Projects\PilotMate\frontend"
npm run dev
```

Then open `http://localhost:3000` in your browser — that's the actual app, for the first time. Click through signup, login, the "Ask Anything" router chat, a direct pre-flight session, and the instructor flow, and tell me what you see and anything that feels off. This is the first phase I can't verify by reading terminal output — it genuinely needs your eyes on it.
