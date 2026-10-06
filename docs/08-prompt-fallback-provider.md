# Prompt — Add Local Fallback Provider (Ollama)

Paste this to opencode before continuing to Phase 7. This adds automatic fallback to your local Ollama model when Gemini's free-tier quota or rate limit is hit, so a quota error during testing no longer stops you cold — it was flagged back in the original roadmap (Phase 1, item 7) and today's 429 on gemini-3.5-flash is exactly the situation it's for.

---

## Prompt to paste into opencode

```
Add an automatic fallback provider to the shared LLM client in agents/gemini_chat.py, so that when the Gemini API returns a quota-exhausted or rate-limit error (429 RESOURCE_EXHAUSTED, and the existing 503 "overloaded" case), the client automatically retries the same request against my local Ollama model instead of raising an exception — no new API key needed, since Ollama already runs locally on this machine (model: qwen2.5-coder:7b-16k, confirmed working from my opencode/Crush terminal setup).

Requirements:

1. CONFIG
   - Add OLLAMA_HOST (default "http://localhost:11434") and OLLAMA_MODEL (default "qwen2.5-coder:7b-16k") to backend/config.py and .env, following the existing GEMINI_MODEL pattern.

2. FALLBACK BEHAVIOR
   - Keep the exact same public interface the agents already use (the chat()/tool-loop methods in agents/gemini_chat.py) — no changes needed in preflight_agent.py, technical_agent.py, debrief_agent.py, or instructor.py. This should be invisible to every caller.
   - On a 429 or persistent 503 from Gemini (after the existing retry/backoff is exhausted, don't fall back on the first transient error), switch to calling local Ollama for that request via Ollama's chat API (http://localhost:11434/api/chat or the ollama Python client, whichever is cleaner given what's already installed).
   - Print/log a clear, visible notice when this happens (e.g. "[fallback] Gemini quota exhausted — using local Ollama model qwen2.5-coder:7b-16k for this response") — this should never fail silently or pretend the response came from Gemini. The app's whole pattern so far has been "never hide what's actually happening," and this is no exception.
   - Tool calling: check whether qwen2.5-coder:7b-16k reliably supports function/tool calling through Ollama's API (needed since every agent in this app — Pre-flight, Technical, Instructor's wrapper — relies on tool calls, not just plain chat). If it does not handle tool calls reliably, tell me clearly rather than silently degrading to a tool-less conversation, and suggest a specific alternative Ollama model that does support tool calling well (e.g. llama3.1 or a newer qwen2.5-instruct tag) for me to pull.
   - If Ollama itself is not reachable (not running), fail with a clear error message telling me to start Ollama — don't crash with a raw connection-refused stack trace.

3. QUALITY EXPECTATION
   - Be explicit in your response: local Ollama models are meaningfully weaker than Gemini for this kind of reasoning. This fallback exists so testing/development isn't blocked by a quota wall, not as a silent swap that should be trusted equally in production. Note this limitation in a comment in the code and mention it to me directly.

Follow the rules in AGENTS.md. Explain your implementation choice (REST call vs ollama Python package, how you detect the 429 vs other errors) before building. After building, test it two ways and show me both: (a) force a fallback by temporarily using an obviously exhausted/invalid Gemini call (or just wait for the real quota window) and confirm Ollama answers with the visible fallback notice, (b) confirm tool-calling still works in fallback mode by running one of the existing test scripts while Gemini is unavailable.
```

---

## What to check once opencode finishes

- Does every existing agent keep working completely unchanged — no edits needed in preflight_agent.py, technical_agent.py, debrief_agent.py, or instructor.py?
- Is the fallback clearly announced in the output, not silent?
- Did it honestly report whether qwen2.5-coder:7b-16k handles tool calls reliably, rather than papering over a failure?
- Does it fail with a clear message (not a stack trace) if Ollama isn't running?
- Did it explicitly flag that the local model is a lower-quality stand-in, not a silent equal substitute?

Once this works, you're no longer blocked by Gemini's daily quota during testing — and then we continue to **Prompt 7 — Exam Prep placeholders (Part 4)**, the last piece of the v1 scope.
