# Corporate Brain

**Team Teh O Ais · Track 3: Intelligent Meeting Capture**

Turns raw meeting recordings into a searchable organizational knowledge graph —
capturing not just *what* was decided, but *why*.

Stack: FastAPI · Celery · Redis · SQLite (metadata) · Neo4j (knowledge graph) ·
Faster-Whisper · Pyannote · Gemini 1.5 Flash · React + Vite + Tailwind · react-force-graph

This repo is built incrementally against `Preliminary/` implementation plan
(Phase 0 → Phase 7). See that plan for the full task breakdown and
Definition of Done per task. **Status: Phase 0, Tasks 0.1–0.2 (project
scaffolding, config layer) are complete** — later phases (pipeline, ASR, LLM
extraction, knowledge graph, query APIs, frontend features) are not
implemented yet.

## Folder structure

```
.
├── backend/
│   ├── main.py            # FastAPI app entrypoint
│   ├── api/                # Route handlers (versioned routers land here)
│   ├── services/           # Business logic (storage, ASR, Gemini, graph, ...)
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── tasks/                # Celery task definitions
│   ├── database/             # DB session/engine setup, migrations
│   └── requirements.txt
├── frontend/                  # React + Vite + Tailwind app
├── storage/                   # Runtime artifacts (raw audio, transcripts, summaries) — gitignored
├── logs/                      # Per-stage rotating log files — gitignored
└── Makefile
```

## Running locally (current state)

Only the backend skeleton and frontend scaffold exist so far — there is no
Docker Compose, Celery worker, or database wiring yet (that lands in later
Phase 0/1 tasks).

### Backend

Run everything from the **repo root** so `backend` resolves as a package:

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1   # Windows PowerShell; use .venv/bin/activate on Mac/Linux
pip install -r backend/requirements.txt
cp .env.example .env         # then fill in GEMINI_API_KEY and NEO4J_PASSWORD
uvicorn backend.main:app --reload
```

The app reads config via `backend/config.py` (Pydantic Settings) and **fails
fast on boot** with a clear validation error if `GEMINI_API_KEY` or
`NEO4J_PASSWORD` aren't set — every other setting has a local-dev default.
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

## Makefile

A `Makefile` is included for Mac/Linux/WSL/Git-Bash-with-make users. On a
plain Windows shell without `make` installed, run the equivalent commands
shown above directly (or `Get-Content Makefile` to see the underlying
commands for each target).

## Development notes

- No secrets are committed. All configuration is centralized via
  `backend/config.py` (Pydantic Settings) — see `.env.example` for every
  available field and which ones are required.
- Each pipeline stage logs to its own file under `logs/` once the logging
  task is implemented.
