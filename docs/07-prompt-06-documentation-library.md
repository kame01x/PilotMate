# Prompt 6 — Documentation Library (Part 3)

Paste this to opencode as your next build instruction. This builds Part 3 (Documentation library) as specified in docs/01-architecture.md, on top of the completed Part 1 (Student) and Part 2 (Instructor).

---

## Prompt to paste into opencode

```
This is Phase 6 of PilotMate: Part 3 — Documentation Library, v1 scope per docs/01-architecture.md. Read that doc's "Part 3 — Documentation library (v1 scope)" section again before starting. Build on the existing backend/models.py, database, and shared code — reuse what's there, don't duplicate it.

This phase is primarily a data model + retrieval feature, not an AI agent — there's no conversation here, just structured browsing. Build it as backend/documents.py (or similar), with:

1. DATA MODEL
   - Add whatever model(s) are needed to represent documents in the library, consistent with the existing schema style in backend/models.py. At minimum: a Document entity with fields for title, category (aircraft-specific vs general), aircraft_type (nullable — only set for aircraft-specific docs), document_type (e.g. POH, checklist, weight & balance sheet, AIP reference, ICAO Doc 8400, phraseology, chart legend), file_reference (a path or URL — see item 2), and source/version info where relevant.
   - Explain this model addition before building it, same as prior phases.

2. CONTENT FOR V1
   - This is a browsing library, not a content-generation feature — do NOT use the Gemini model to generate aircraft POH data, checklists, or regulatory text. That would risk presenting fabricated content as if it were a real official document, which conflicts with every safety principle established in the earlier phases.
   - For v1, populate the library with references to real, publicly available documents: link out to official sources (e.g. FAA/EASA published POH summaries where legally shareable, ICAO Doc 8400 itself, public AIP documents, publicly available chart legends) rather than hosting copyrighted manufacturer POH content yourself. Where a real aircraft-specific POH isn't legally redistributable, store it as a reference entry pointing to where the student should obtain it (e.g. their flight school, the manufacturer), not as fabricated content.
   - Implement browse/retrieval functions: list_by_aircraft(aircraft_type), list_general_reference(), get_document(document_id) — straightforward querying, no model calls needed.
   - Seed the database with a small real starter set (not placeholder junk) covering: one aircraft type already used elsewhere in the app (Cessna 172) with its typical reference documents, plus the general section's four items named in the architecture doc (AIP reference, ICAO Doc 8400, radiotelephony phraseology, chart legend reference) as real linked references.

3. INTEGRATION
   - The Technical Agent (Phase 3) and Pre-flight Agent (Phase 2) both currently say things like "a visual aid is recommended from the documentation library (Part 3)" without that library existing yet. Now that it does, wire a minimal lookup so those agents can mention a real, specific document from the library when relevant (e.g. the Technical Agent's stall diagram response can now point to an actual Cessna 172 POH reference entry instead of a generic mention) — small, targeted change, don't restructure those agents.

4. SAFETY
   - Every document entry must be clearly labeled with its source and, where applicable, a reminder that the student must confirm currency/applicability against the official current version — documents go out of date, and a cached reference here should never be treated as automatically current.
   - No fabricated or AI-generated regulatory/aircraft content presented as if it were official — real links/references only, per item 2.

5. MODEL / KEYS
   - No new API keys should be needed (this is static reference data, not live lookups). If you find a genuine need for one, stop and tell me before proceeding.

Follow the rules in AGENTS.md. Explain your architectural decisions before making them, especially the new Document model and how you sourced the starter content (so I know these are real references, not invented ones). After building, write a test script that: (a) lists all Cessna 172 documents, (b) lists the general reference section, (c) retrieves one specific document and shows its full metadata including source/currency notice, (d) runs the Technical Agent's "stall" exercise again and shows that it now references a real library entry instead of a generic mention. Show me all four outputs.
```

---

## What to check once opencode finishes

- Are the seeded documents real, verifiable references (actual FAA/EASA/ICAO sources, real URLs) — not placeholder text or, worse, AI-fabricated content presented as official?
- Does every entry carry a source and a "confirm currency" reminder, consistent with the app's safety pattern from every earlier phase?
- For aircraft-specific content it can't legally redistribute (like a full copyrighted POH), does it correctly point to where to obtain it instead of inventing substitute content?
- Does the Technical Agent's stall response actually now cite a specific library entry, not just repeat the same generic "available in the documentation library" line as before?
- Did it avoid using the Gemini model to generate any of the library content itself?

Once confirmed working, commit this checkpoint. That completes Part 3. The only remaining piece per the architecture doc is Part 4 (Exam prep) — which is explicitly a placeholder-only phase (three buttons: PPL, ATPL, Know Your Aircraft, all showing "under construction"), so it's a short one. Say the word and I'll send Prompt 7 to finish out the full v1 scope.
