# Prompt 2 — Pre-flight Agent

Paste this to opencode as your next build instruction. This builds the full Pre-flight Agent as specified in docs/01-architecture.md, on top of the Phase 1 database foundation.

---

## Prompt to paste into opencode

```
This is Phase 2 of PilotMate: the Pre-flight Agent. Read docs/01-architecture.md for full context before starting, and build on the existing backend/models.py and database from Phase 1 — don't recreate the data model.

Build the Pre-flight Agent in agents/preflight_agent.py, with the following behavior:

1. CONVERSATION FLOW
   - The agent collects flight details from the student: departure airport, destination (if cross-country), route, aircraft type, exercise type, flight rules (VFR/IFR).
   - For runway surface (grass/concrete) and controlled/uncontrolled status, present these as explicit choices the student confirms every time — never assume or reuse from a previous flight, even for the same airport. If you can look up the airport's actual data (see data sources below) and it conflicts with what the student selected, tell the student what you found and ask them to confirm — never silently override their choice.
   - Once confirmed, save this as a new Flight record linked to the student.

2. DATA SOURCES AND TOOLS (implement each as a separate tool function)
   - Weather (METAR/TAF): call the free aviationweather.gov API directly (no key required). Implement as a tool, e.g. get_metar_taf(airport_icao).
   - Airport basics (runway surface, controlled status, frequencies): use Aviowiki's free Open Data API as a first source. Implement as get_airport_info(airport_icao).
   - NOTAM / active areas: since there is no single free worldwide API, implement this as a web search tool (use a search tool, e.g. Tavily if available, or note what's needed if not yet configured) that finds the relevant country's official AIS/self-briefing website and extracts NOTAM and active-area information, with time windows where available. Always include the source link in the output alongside the summary. If you don't have a search tool API key available yet, build the tool's structure correctly and clearly note in code comments and in your explanation to me what key/setup is needed.
   - Mass and balance: given an aircraft type, provide typical reference POH values (empty weight, arm, max weight) as a starting point, clearly labeled as reference data, and prompt the student to confirm/adjust for actual load (passengers, bags, fuel) that day.
   - Flight plan: if the student provides a route, use it as given. If they ask for a suggestion, propose one and cross-check it against any active/restricted area data already retrieved, flagging conflicts.
   - Document checklist: a simple list the student self-confirms they have (CPL, RT, medical, insurance, passport if cross-country) — no verification needed from the agent, just reminders about expiry if the student has provided a date.

3. OUTPUT
   - Compile everything into a PreflightPackage record linked to the Flight, matching the fields in backend/models.py.
   - Every weather, NOTAM, and mass & balance section in the output must clearly state this is a reference the student/instructor must verify before flight, and include the source link where applicable.

4. SAFETY AND VERIFICATION
   - Follow the human-in-the-loop verification pattern described in docs/01-architecture.md throughout: the agent prepares and flags discrepancies, but the student always makes the final confirmation.

5. MODEL
   - Use Gemini (google_genai:gemini-3.8-flash) as the default model, reading the API key from .env. If any new API keys are needed for the tools above (e.g. a search tool), list exactly what needs to be added to .env and ask me before proceeding with that specific tool, rather than guessing or hardcoding a placeholder.

Follow the rules in AGENTS.md. Explain any architectural decisions before making them, especially anything not explicitly covered above. After building, write a simple test script that simulates a full pre-flight conversation for one test flight and show me the output.
```

---

## What to check once opencode finishes

- Does it ask for confirmation on runway surface / controlled status rather than assuming?
- Does the weather tool actually return real METAR/TAF data for a real airport?
- If it needed a new API key (likely for the search tool), did it clearly tell you rather than silently failing or faking data?
- Does the test script's output show a complete, structured pre-flight package with source links and verification reminders?

Once confirmed working, we'll commit this checkpoint and move to **Prompt 3 — Technical Agent**.
