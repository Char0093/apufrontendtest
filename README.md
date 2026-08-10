# Corporate Brain

**Team Teh O Ais · Track 3: Intelligent Meeting Capture**

Turns raw meeting recordings into a searchable organizational knowledge graph —
capturing not just *what* was decided, but *why*.

Stack: FastAPI · Celery · Redis · SQLite (metadata) · Neo4j (knowledge graph) ·
Faster-Whisper · Pyannote · Gemini · React + Vite + Tailwind · react-force-graph

This repo is built incrementally against
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — see that file for
the full phase/task breakdown, team allocation, and the critical MVP chain.
**Status: Phase 0 is complete** (monorepo structure, config layer, logging,
FastAPI init, Docker Compose, Celery + Redis) — everything from Phase 1
onward (meeting ingestion, ASR, LLM extraction, knowledge graph, query
APIs, frontend features) is not implemented yet.

## Folder structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app entrypoint
│   │   ├── api/               # Route handlers (health.py, more per phase)
│   │   ├── core/               # config.py, logger.py, middleware.py, exceptions.py, celery_app.py
│   │   ├── database/            # DB session/engine setup, migrations
│   │   ├── graph/                 # Neo4jService (Phase 4)
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   ├── schemas/                  # Pydantic request/response schemas
│   │   ├── services/                   # Business logic (storage, ASR, Gemini, ...)
│   │   └── tasks/                        # Celery task definitions
│   ├── storage/                              # raw/audio/transcripts/summaries/exports — gitignored
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/ pages/ services/ hooks/ types/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── Dockerfile
├── docs/
│   └── IMPLEMENTATION_PLAN.md
├── docker-compose.yml
├── .env.example              # secrets for `docker compose up` (separate from backend/.env.example)
└── Makefile
```

## Running locally (current state)

The backend is a real (if minimal) FastAPI app now — CORS, a global
exception handler, request logging, and a small pytest suite are all wired
in. `docker compose up` brings up all 5 services together, and the Celery
worker has one real (stub) task registered. There's no database wiring or
actual pipeline yet — that starts with Phase 1.

### Backend

Run everything from **`backend/`** — `app` resolves as a package because
that's the working directory (this matches how `backend/Dockerfile` runs it
too, so local dev and the container behave the same way):

```bash
cd backend
python -m venv ../.venv
../.venv/Scripts/Activate.ps1   # Windows PowerShell; use ../.venv/bin/activate on Mac/Linux
pip install -r requirements.txt
cp .env.example .env            # then fill in GEMINI_API_KEY and NEO4J_PASSWORD
uvicorn app.main:app --reload
```

Config is centralized in `app/core/config.py` (Pydantic Settings) and the
app **fails fast on boot** with a clear validation error if `GEMINI_API_KEY`
or `NEO4J_PASSWORD` aren't set — every other setting has a local-dev default.
Never commit your real `.env`; only `.env.example` is tracked.

Then visit `http://127.0.0.1:8000/health` — should return `{"status": "ok"}`.
Interactive docs at `http://127.0.0.1:8000/docs`.

CORS is restricted to the Vite dev origins (`localhost:5173` /
`127.0.0.1:5173`) — not wildcarded. Any exception the app doesn't handle
itself returns a clean `{"detail": "Internal server error"}` (500) instead
of leaking a traceback to the client; the real traceback goes to
`backend/logs/error.log`. Every request is logged to `backend/logs/app.log`
with method, path, status code, and duration.

Run the test suite with `pytest` (from `backend/`, or `make test` from the
repo root):

```bash
cd backend
pytest
```

To run the Celery worker locally against a Dockerized Redis
(`docker compose up -d redis`), without the rest of the stack:

```bash
cd backend
celery -A app.core.celery_app worker --loglevel=info
```

`app/tasks/meeting_tasks.py` has one task registered, `process_meeting_task`
— currently a logging stub; it starts orchestrating the real pipeline once
Phase 1-4 land.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then visit the URL Vite prints (default `http://localhost:5173`).

### Docker

```bash
cp .env.example .env   # repo root — fill in GEMINI_API_KEY and NEO4J_PASSWORD
docker compose up --build
```

This is a **separate `.env`, at the repo root** — not `backend/.env`. Compose
uses this one to substitute `${GEMINI_API_KEY}`/`${NEO4J_PASSWORD}` into
`docker-compose.yml` (for `NEO4J_AUTH` and the two Python services' secrets);
`backend/.env` is only read when you run the backend directly, outside
Docker. If you use both workflows, keep them in sync.

Brings up all 5 services on a shared network: `redis`, `neo4j`,
`fastapi-backend` (`:8000`), `celery-worker` (same image, runs
`celery -A app.core.celery_app worker` instead of uvicorn), and
`frontend-dev` (`:5173`). Neo4j Browser at `:7474`. Verified end-to-end:
all 5 containers stay up, `/health` and `/` respond, the frontend serves
its dev HTML, and a real task dispatched to the worker (`process_meeting_task`)
is received and executed successfully.

`docker compose down -v` to stop and remove the Neo4j volume — do this if
you ever change `NEO4J_PASSWORD`, since the volume bakes in whatever
password Neo4j was first created with and won't accept a different one on
restart.

## Makefile

A `Makefile` is included for Mac/Linux/WSL/Git-Bash-with-make users. On a
plain Windows shell without `make` installed, run the equivalent commands
shown above directly (or `Get-Content Makefile` to see the underlying
commands for each target).

## Development notes

- No secrets are committed. All configuration is centralized via
  `backend/app/core/config.py` (Pydantic Settings) — see
  `backend/.env.example` for every available field and which ones are
  required (`GEMINI_API_KEY`, `NEO4J_PASSWORD`).
- `backend/app/core/logger.py` provides `get_logger(name, worker=False)`,
  writing to `backend/logs/app.log` (default) or `backend/logs/worker.log`
  (Celery-side code), with everything at `ERROR` level or above also
  mirrored to `backend/logs/error.log`. All three are rotating (5MB × 3
  backups) and gitignored.
