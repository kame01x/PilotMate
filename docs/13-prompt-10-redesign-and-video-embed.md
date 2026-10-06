# Prompt 10 — Embedded Video Player

Paste this to opencode. This adds one feature: videos referenced by the Technical Agent now play directly inside the chat, instead of being a link the student has to click away to YouTube for. Visual redesign (colors/layout) is intentionally held back — that's a separate conversation once you've decided the direction you want.

---

## Prompt to paste into opencode

```
This is Phase 10 of PilotMate: an embedded video player feature. No backend changes needed, no visual/color redesign — this is a single, scoped frontend feature on top of what Phase 9 built. Do not change colors, theme, or layout — leave the current visual style exactly as it is.

EMBEDDED VIDEO PLAYER
- When any agent response (Technical Agent via find_reference_video, or anything routed through it) contains a YouTube link, detect it and render it as an embedded, playable video directly in the chat message — not just a clickable text link. Use a standard YouTube iframe embed (https://www.youtube.com/embed/VIDEO_ID) sized reasonably within the chat bubble (not full-width/oversized — think "fits naturally in a chat message," roughly 16:9, capped width).
- This should apply everywhere a video might appear: the Technical Agent's direct exercise path, its open-topic path, and the router's "Ask Anything" path when it hands off to Technical.
- If a response contains a video link that for some reason can't be parsed into an embeddable ID (malformed URL, non-YouTube source), fall back gracefully to a plain clickable link — never break the page or hide the reference entirely.
- Keep the surrounding text (theory, common errors, authority caveat, etc.) exactly as before — only the video reference itself changes from text-link to embedded player. Nothing else about the existing pages should change.

Follow the rules in AGENTS.md. Explain your approach before building — specifically how you're detecting/parsing YouTube URLs for the embed. After building, tell me how to see the change (I assume just refreshing the already-running frontend, confirm or correct that) and which exact question to ask in the Technical tab to trigger a video response so I can verify it plays inline.
```

---

## What to check once opencode finishes

- Does a real video actually play inline in the chat (not just open a bigger link, not just embed-but-broken)?
- Is the fallback-to-plain-link path there for malformed/non-YouTube URLs, so nothing breaks?
- Did it leave everything else (colors, layout, other pages) untouched, as instructed?

---

## Trying it out

Once opencode finishes, refresh your browser tab (`http://localhost:3000`) — no server restart needed for frontend-only changes, Next.js hot-reloads automatically while `npm run dev` is running. If something doesn't update, a hard refresh (Ctrl+Shift+R) usually fixes it.

Go back to the Technical tab and ask about flare or stall again (works best once Gemini's quota resets, so the video tool executes cleanly rather than hitting the fallback) and you should see the video playing right there instead of a plain link.

Once you've confirmed this works, whenever you're ready we'll have the separate conversation about visual direction — colors, layout, branding — and I'll build that as its own prompt based on what you tell me you want.
