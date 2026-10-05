# Prompt 1 — Project Setup & Data Model

Paste this to opencode as your first build instruction. This phase builds the foundation only — no agents, no UI yet. Goal: a working backend skeleton with the right data model and a clean project structure, so every later phase has something solid to build on.

---

## Prompt to paste into opencode

```
We are building PilotMate, a training assistant app for student pilots and flight instructors. This is Phase 1 of a multi-phase build: project setup and data model only. Do not build any AI agents, UI, or business logic yet — this phase is foundation only.

Read docs/01-architecture.md in this project for the full data model and context before doing anything.

For this phase:

1. Set up a clean Python project structure:
   - /agents (empty for now, will hold agent code in later phases)
   - /backend (core app logic, database models, API routes)
   - /docs (planning docs, already has 01-architecture.md)
   - pyproject.toml with uv for dependency management

2. Implement the data model described in docs/01-architecture.md using SQLAlchemy (or your recommended equivalent) with these entities: Student, Instructor, Flight, PreflightPackage, Debrief, InstructorMessage. Use the exact fields listed in the architecture doc. Explain if you think any field should be added or changed, and ask before changing the structure.

3. Use SQLite for local development (simple file-based database), but structure the code so switching to Postgres later is a config change, not a rewrite.

4. Set up environment variable loading via python-dotenv, reading from the existing .env file. Do not hardcode any values.

5. Create a simple database initialization script that creates all tables, and a basic seed script that adds one test student and one test instructor, so we can verify the schema works.

6. Write a short README.md explaining how to run the setup (install dependencies, initialize the database, run the seed script).

Follow the rules in AGENTS.md at every step. Ask before any major architectural decision. After finishing, explain what you built, run the seed script to confirm it works, and show me the output.
```

---

## What to check once opencode finishes

- Does the database actually get created when you run the init script?
- Does the seed script successfully add a test student and instructor?
- Ask opencode to show you the generated database schema (table structures) so you can confirm it matches `01-architecture.md` before moving to Phase 2.

Once this is working and confirmed, come back and we'll write **Prompt 2 — Pre-flight Agent**, building the first real agent on top of this foundation.
