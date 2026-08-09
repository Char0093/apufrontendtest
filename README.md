# Corporate Brain

**Team Teh O Ais · Track 3: Intelligent Meeting Capture**

Turns raw meeting recordings into a searchable organizational knowledge graph —
capturing not just *what* was decided, but *why*.

Stack: FastAPI · Celery · Redis · SQLite (metadata) · Neo4j (knowledge graph) ·
Faster-Whisper · Pyannote · Gemini · React + Vite + Tailwind · react-force-graph

This repo is built incrementally against
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — see that file for
the full phase/task breakdown, team allocation, and the critical MVP chain.
**Status: Phase 0, Tasks 0.1–0.3 (monorepo structure, config layer,
logging) are complete** — Tasks 0.4+ (FastAPI init, Docker Compose,
Celery/Redis) and everything from Phase 1 onward are not implemented yet.

## Folder structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app entrypoint
│   │   ├── api/               # Route handlers (routers land here)
│   │   ├── core/               # config.py (Settings), logger.py
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
└── Makefile
```

## Running locally (current state)

Only the backend skeleton and frontend scaffold exist so far — there is no
Docker Compose, Celery worker, or database wiring yet (Tasks 0.4–0.6).

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

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then visit the URL Vite prints (default `http://localhost:5173`).

### Docker

`backend/Dockerfile` and `frontend/Dockerfile` exist and build standalone
images, but there's no `docker-compose.yml` yet (that's Task 0.5) and Docker
builds haven't been verified in this environment — the local Docker daemon
wasn't reachable when this was last touched. Sanity-check before relying on
them: `docker build ./backend` / `docker build ./frontend`.

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
