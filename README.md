# PilotMate

**PilotMate is an aviation training assistant for student pilots and flight instructors.**

It brings together aviation training workflows in one application, helping student pilots prepare for flights, review their performance, and develop their technical knowledge while supporting instructor–student collaboration.

## Main Features

- **Student workspace:** Dashboard and access to aviation training activities.
- **Pre-flight preparation:** Flight preparation workflows and aviation information.
- **Flight debriefing:** Review completed flights and reflect on performance.
- **Technical training:** Explore aviation topics and ask questions.
- **Instructor workspace:** Tools supporting instructor and student collaboration.
- **AI-assisted capabilities:** Integrated assistance for selected training workflows.

PilotMate is a training and educational application. It is not a substitute for approved flight planning, official aviation publications, instructor supervision, or operational decision-making.

## Technology

- **Frontend:** Next.js 16, React 19, TypeScript and Tailwind CSS.
- **Backend:** Python 3.12+, FastAPI and Uvicorn.
- **Database:** SQLAlchemy with SQLite or PostgreSQL.
- **Integrations:** Gemini, aviation information services and Stripe.

## Run Locally

### Requirements

- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)
- Node.js 20.9 or newer
- npm

### Backend

From the project root:

```bash
uv sync
```

Create a root `.env` file and configure the API keys needed for the integrations you use:

```env
DATABASE_URL=sqlite:///./pilotmate.db
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
TAVILY_API_KEY=
AVIOWIKI_API_KEY=
```

Initialize the database:

```bash
uv run python scripts/init_db.py
```

Start the backend:

```bash
uv run uvicorn backend.api.main:app --reload
```

API documentation: http://127.0.0.1:8000/docs

### Frontend

Open a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000.

Configure the frontend backend connection using the appropriate environment variables for your local or deployed environment. Never publish credentials or private deployment settings.

## Project Structure

- `agents/` — AI-assisted training agents
- `backend/` — FastAPI application and backend services
- `docs/` — Project documentation
- `frontend/` — Next.js application
- `scripts/` — Development and maintenance scripts
- `pyproject.toml` — Python project configuration

## Testing

- Backend: run the FastAPI application and check `/health`.
- Frontend development: `npm run dev`
- Production build: `npm run build`
- Frontend tests: `npm test`

## Author and Development

**Created and independently developed by Sofiane Nahi.**

The project concept, aviation requirements, product direction, development decisions, integration and testing were led by the creator.

Development involved open-source technologies and AI-assisted coding tools. No other human developers contributed to the project.