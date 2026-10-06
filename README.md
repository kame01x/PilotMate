# PilotMate

Training assistant app for student pilots and flight instructors.

## Phase 1 — Setup

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager

### Install dependencies

```bash
uv sync
```

### Initialize the database

```bash
uv run python scripts/init_db.py
```

This creates all tables in the configured database (SQLite by default).

### Seed the database

```bash
uv run python scripts/seed_db.py
```

Inserts one test student (`STU-0001`) and one test instructor (`INS-0001`).

## Configuration

All configuration is read from `.env` at the project root:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./pilotmate.db` | SQLAlchemy database URL. Change to a Postgres connection string to switch databases. |
| `GEMINI_API_KEY` | — | Gemini API key for the Pre-flight Agent chat. Without it, tools still run directly. |
| `TAVILY_API_KEY` | — | Enables NOTAM/active-area web search tool. Without it, the tool returns a notice. |
| `AVIOWIKI_API_KEY` | — | Optional token for Aviowiki airport lookups (unauthenticated calls work, rate-limited). |

### Pre-flight Agent test

```bash
uv run python scripts/test_preflight.py
```

Simulates a full pre-flight conversation (weather, airport info, NOTAMs, mass & balance, checklist) and saves a Flight + PreflightPackage.

### Switching to Postgres

1. Install the Postgres driver: `uv add psycopg2-binary`
2. Update `.env`:
   ```
   DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/pilotmate
   ```
3. Re-run `init_db.py` — no code changes needed.

## Project Structure

```
PilotMate/
├── agents/                  # Agent code (later phases)
├── backend/
│   ├── config.py            # Env loading, DATABASE_URL
│   ├── database.py          # Engine + session factory
│   └── models.py            # SQLAlchemy models
├── docs/                    # Planning documents
├── scripts/
│   ├── init_db.py           # Create all tables
│   └── seed_db.py           # Insert test data
├── .env                     # Local config (not in git)
├── pyproject.toml           # uv project definition
└── README.md
```

## Data Model

See [docs/01-architecture.md](docs/01-architecture.md) for the full architecture and data model specification.
