# Prompt 11 — Aviation Visual Identity + Layout

Paste this to opencode. This is the full visual redesign: colors, layout, and navigation structure, based on glass-cockpit instrument design conventions.

---

## Prompt to paste into opencode

```
This is Phase 11 of PilotMate: full visual redesign. No backend changes. This replaces whatever default/placeholder styling exists with a specific aviation-instrument-inspired visual identity and a specific layout restructure. Read this carefully — it's detailed and intentional, not "make it look nicer."

1. COLOR SYSTEM — glass cockpit inspired
   Define these as CSS variables / Tailwind theme tokens in ONE central place (not hardcoded per-component), with a dark theme (default) and a light theme (secondary, user-toggleable):

   Dark mode (default):
   - Background: #0B0F19
   - Surface/cards: #121826
   - Primary accent ("open horizon" sky blue): #38BDF8
   - Secondary accent ("magenta line" — marks the active/selected/current item, same role as the course line on a nav display): #E6399E
   - Primary text: #F5F7FA
   - Muted text: #94A3B8
   - Caution/verify-before-flight (amber — real aviation caution color): #FBBF24
   - Success/confirmed: #34D399
   - Error (used sparingly, real failures only): #F87171

   Light mode:
   - Background: #F7FAFC
   - Surface/cards: #FFFFFF with #E2E8F0 borders
   - Primary accent: #0EA5E9
   - Secondary accent (magenta): #C026D3
   - Primary text: #0F172A
   - Muted text: #475569
   - Caution: #D97706
   - Success: #059669
   - Error: #DC2626

   Rationale to preserve in your implementation: the dark theme is the default because a dark background with bright accent colors reads well in both bright sunlight glare and at night, unlike a plain white screen — this is deliberately modeled on how aircraft instrument displays solve the same readability problem. Add a theme toggle (dark/light) accessible from the header, defaulting to dark on first visit.

   CRITICAL — reuse the semantic colors correctly, don't just decorate with them: every weather/NOTAM/mass-balance "reference data, verify before flight" notice and every Debrief "draft — pending instructor review" label must use the caution/amber color as a clear badge or banner — this is not optional decoration, it's using the real aviation meaning of amber (caution) to reinforce the app's actual safety function. Don't let amber appear elsewhere as mere decoration, which would dilute its meaning.

2. BACKGROUND TREATMENT
   - Working screens (dashboards, chat, data cards) stay clean and high-contrast — no decorative texture behind content you need to read quickly.
   - Auth/landing pages only: a subtle horizon-style gradient (navy fading toward sky blue) or a very faint flight-plan/nav-chart grid pattern at low opacity, purely decorative, never behind body text.

3. LAYOUT RESTRUCTURE (this changes the Phase 9 navigation structure)
   - Left sidebar: Pre-flight, Technical, Debrief, Flight History, Documentation Library, Exam Prep — as icon + label items, noticeably larger and more generously spaced than a typical compact sidebar (clear visual breathing room between each item, not cramped). This sidebar does NOT include "Ask Anything."
   - "Ask Anything" is its own prominent, centered element at the TOP of the main content area, above the chat conversation — think a headline-style input (e.g. a centered heading like "Ask Anything" with a large centered input field beneath it), not just another sidebar tab. When the student is on this view, their free-form question goes here.
   - Below the "Ask Anything" header area, the conversation (whichever agent's chat is active — router hand-off, or a sidebar-selected specialist) renders in a centered column, reading upward, with the message input docked at the bottom center of the page — a ChatGPT-style centered chat layout, restyled with the color system above instead of generic SaaS colors.
   - This is a real restructure of Phase 9's navigation, not just a style pass — explain how you're reorganizing the component tree to achieve this (e.g. a persistent layout shell with sidebar + centered main column) before you build it.

4. PRESERVE FUNCTIONALITY
   - Every existing feature (auth, the embedded video player from Phase 10, the runway/controlled-status explicit confirmation, safety notices, draft-labeled debrief content, instructor messaging) must keep working exactly as before — this phase changes how things look and are arranged, not what they do.

Follow the rules in AGENTS.md. Explain your approach before building: how the color tokens are structured, how the layout shell is organized (sidebar + centered "Ask Anything" + centered chat), and how the theme toggle works. After building, tell me how to view the changes and which pages to click through to see the full new identity (landing/auth, the new Ask Anything layout, the sidebar with the specialist tabs, and a caution-badge example like a Pre-flight weather card).
```

---

## What to check once opencode finishes

- Is the color system centralized (one place to edit), with both dark (default) and light themes working?
- Does amber/caution actually mark the real safety notices and draft-debrief content specifically — not just scattered as decoration?
- Is "Ask Anything" genuinely a distinct, prominent, centered top element — not just another sidebar button?
- Are the sidebar icons noticeably larger and better spaced than before?
- Does everything from Phases 1-10 still actually work (auth, video embed, confirmations, messaging) — this should be a restyle/restructure, not a functional regression?

---

## Trying it out

Refresh `http://localhost:3000` once it's done (frontend-only change, no restart needed). Take a look at the landing/auth page, the new Ask Anything layout, the sidebar, and a Pre-flight weather card to see the amber caution badge in action — then tell me what you think and what you want adjusted.
