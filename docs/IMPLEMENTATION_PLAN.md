# Corporate Brain — Complete Prototype Implementation Plan

This is the authoritative task breakdown for the project (supersedes any
earlier plan). Each task is scoped to be independently implementable, with a
clear responsibility, input/output, and dependency — suitable for turning
directly into GitHub Issues.

## Overall Architecture

```text
                         ┌─────────────────────┐
                         │      React UI        │
                         │                     │
                         │ Upload / Dashboard  │
                         │ Summary / Graph     │
                         │ Transcript / Chat   │
                         └──────────┬──────────┘
                                    │ REST API
                                    ▼
                         ┌─────────────────────┐
                         │      FastAPI        │
                         │                     │
                         │ Upload API          │
                         │ Meeting API         │
                         │ Query API           │
                         │ Graph API           │
                         └──────────┬──────────┘
                                    │
                       ┌────────────┴────────────┐
                       │                         │
                       ▼                         ▼
                  ┌─────────┐              ┌──────────┐
                  │ SQLite  │              │  Redis   │
                  │         │              │          │
                  │ Metadata│              │  Queue   │
                  └─────────┘              └────┬─────┘
                                                 │
                                                 ▼
                                      ┌──────────────────┐
                                      │ Celery Worker    │
                                      │                  │
                                      │ Pipeline         │
                                      └────────┬─────────┘
                                               │
              ┌────────────────────────────────┼──────────────────────────┐
              │                                │                          │
              ▼                                ▼                          ▼
       ┌─────────────┐                 ┌─────────────┐              ┌──────────┐
       │ FFmpeg/VAD  │                 │  Whisper    │              │ Pyannote │
       │             │                 │             │              │          │
       │ Preprocess  │                 │ Transcript  │              │ Speakers │
       └──────┬──────┘                 └──────┬──────┘              └────┬─────┘
              │                               │                          │
              └───────────────────────────────┼──────────────────────────┘
                                              ▼
                                      ┌──────────────┐
                                      │    Gemini    │
                                      │              │
                                      │ Summary      │
                                      │ Decisions    │
                                      │ Actions      │
                                      │ Risks        │
                                      │ Knowledge    │
                                      └───────┬──────┘
                                              │
                                              ▼
                                      ┌──────────────┐
                                      │    Neo4j     │
                                      │              │
                                      │ Knowledge    │
                                      │ Graph        │
                                      └──────────────┘
```

## PHASE 0 — Infrastructure & Project Setup

### Task 0.1 — Initialize Monorepo

**Objective:** Create the basic project structure for frontend and backend.

```text
corporate-brain/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── database/
│   │   ├── graph/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── tasks/
│   │
│   ├── storage/
│   │   ├── raw/
│   │   ├── audio/
│   │   ├── transcripts/
│   │   ├── summaries/
│   │   └── exports/
│   │
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── types/
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

**Deliverable:** All developers can clone the repository and start development.

### Task 0.2 — Configuration

Use environment variables for:

```text
GEMINI_API_KEY
NEO4J_URI
NEO4J_USERNAME
NEO4J_PASSWORD
REDIS_URL
DATABASE_URL
STORAGE_PATH
```

Create `.env.example`. Never commit `.env`.

### Task 0.3 — Logging

Create a centralized logging system. Log `INFO` / `WARNING` / `ERROR`, e.g.:

```text
[INFO] Meeting abc uploaded
[INFO] Celery task started
[INFO] Whisper completed
[ERROR] Gemini request failed
[INFO] Neo4j graph created
```

### Task 0.4 — FastAPI Initialization

Create the FastAPI application. Implement `GET /health`. Also configure:
CORS, exception handling, API routers, request logging.

### Task 0.5 — Docker Compose

Services: `redis`, `neo4j`, `fastapi-backend`, `celery-worker`, `frontend-dev`.
All services share a Docker network. Verify `docker compose up` starts the
entire application.

### Task 0.6 — Celery + Redis

Set up FastAPI → Redis → Celery Worker. Create `process_meeting_task(meeting_id)`,
which will eventually orchestrate the complete processing pipeline.

## PHASE 1 — Meeting Ingestion

### Task 1.1 — Storage Service

Implement a storage abstraction, `StorageService`, with methods:
`save_raw_file()`, `save_audio()`, `save_transcript()`, `save_summary()`,
`save_export()`, `get_file()`.

### Task 1.2 — Database Models

SQLite + SQLAlchemy.

**Meeting:** `id, title, project, date, duration, file_path, status, progress, created_at, updated_at`

**ProcessingTask:** `id, meeting_id, status, progress, error_message, retry_count, created_at, updated_at`

### Task 1.3 — Meeting Creation

`POST /meetings` — input `{title, project, date}` → returns `{meeting_id}`.

### Task 1.4 — Upload Meeting

`POST /upload` — supports `.mp3 .wav .m4a .mp4`. Flow: upload → generate
UUID → save file → create DB record → queue Celery → return `meeting_id`.

### Task 1.5 — Processing Status

`GET /task/{meeting_id}/status` → `{meeting_id, status, progress_percentage}`.

### Task 1.6 — Retry & Failure Handling

Celery retries (attempt 1 → 2 → 3 → failed), DB records the error.

## PHASE 2 — Audio Processing & ASR

*(Primarily owned by A — AI Engineer)*

### Task 2.1 — FFmpeg + VAD

Input: MP3/WAV/M4A/MP4 → Output: 16kHz mono PCM WAV. Silero VAD removes
leading/trailing silence and bursts shorter than 0.5s. Save to
`/storage/audio/{meeting_id}.wav`.

### Task 2.2 — Faster-Whisper

`large-v3` on GPU, `base` on CPU. Generate `{start, end, text}` segments.

### Task 2.3 — Speaker Diarization

Pyannote identifies `Speaker_0/1/2...`, aligned with Whisper timestamps.

### Task 2.4 — Transcript JSON

`{"meeting_id", "segments": [{"start", "end", "speaker", "text"}]}`, saved to
`/storage/transcripts/{meeting_id}.json`.

## PHASE 3 — LLM Meeting Intelligence

### Task 3.1 — Design Gemini Schema

`{summary, decisions: [{title, reason, evidence}], action_items: [{task, assignee, deadline}], risks, knowledge_triples: [{subject, predicate, object}]}`.

### Task 3.2 — Gemini Extraction

Input: speaker-attributed transcript → Output: structured meeting
intelligence via Gemini response schema. Handle API errors, rate limits,
timeout, retry.

### Task 3.3 — JSON Validation

Validate Gemini output with Pydantic. Handle invalid JSON, missing fields,
trailing commas, incorrect types. If repair fails, retry Gemini.

## PHASE 4 — Knowledge Graph

### Task 4.1 — Neo4j Connection

Configure `NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD`; create a reusable
`Neo4jService`.

### Task 4.2 — Graph Schema

Nodes: `(:Meeting) (:Person) (:Decision) (:ActionItem) (:Project)`.
Relationships: `PARTICIPATED_IN, MADE_IN, ASSIGNED_TO, RELATES_TO`.

### Task 4.3 — Graph Builder

Input: `MeetingAnalysis` → Meeting → Persons → Decisions → Action Items →
Projects → Relationships. Use `MERGE` to prevent duplicates.

### Task 4.4 — Graph Verification

`MATCH (n) RETURN n LIMIT 50` — verify the expected relationship shapes exist.

## PHASE 5 — Backend APIs

- **5.1** `GET /meetings` — filters: keyword, project, participant, date
- **5.2** `GET /meeting/{id}/transcript` — speaker-attributed transcript
- **5.3** `GET /meeting/{id}/summary` — summary, decisions, action_items, risks
- **5.4** `GET /meeting/{id}/graph-data` — `{nodes: [], links: []}` for `react-force-graph`
- **5.5** `POST /query` — NL question → predefined Cypher template → `{answer, results, cypher}` (Cypher transparency)

## PHASE 6 — React Frontend

- **6.1** Meeting List (homepage, upload button, recent meetings w/ status)
- **6.2** Upload UI (drag & drop, title, project, uploading/processing states)
- **6.3** Meeting Detail (tabs: Summary / Transcript / Graph / Chat)
- **6.4** Summary View (decisions, action items w/ assignee + deadline, risks)
- **6.5** Transcript View (timestamped, speaker-attributed, click-to-highlight)
- **6.6** Knowledge Graph (`react-force-graph`, zoom/drag/click/highlight)
- **6.7** Chat Interface (ask questions, see AI answers)

## PHASE 7 — Demo & Product Polish

- **7.1** Decision Timeline — chronological decisions with reason/participants/evidence
- **7.2** Export Report — `GET /meeting/{id}/export` + download button
- **7.3** Demo Dataset — at least 3 connected meetings telling one story
- **7.4** Loading & Error States — uploading/processing/completed/failed/retrying, user-friendly backend error messages

## PHASE 8 — Integration & Testing

*(Led by D — QA/Integration, with A/B/C supporting)*

- **8.1** API Contract Testing (every endpoint)
- **8.2** End-to-End Test (full upload → graph → React pipeline)
- **8.3** Failure Testing (invalid file, empty audio, Gemini timeout, Whisper
  failure, Neo4j/Redis unavailable, malformed Gemini JSON)
- **8.4** Regression Testing (upload/summary/transcript/graph/chat/export on
  every major merge)
- **8.5** Docker Deployment Test (fresh machine, `git clone` + `docker
  compose up` works with zero manual config fixes)

## PHASE 9 — Final Demo Preparation

- **9.1** Demo Script (upload → processing → summary → decision+reason →
  transcript → graph → chat → Cypher transparency → timeline → export)
- **9.2** Backup Demo — a pre-processed meeting ready to show instantly if
  live Gemini/Whisper processing fails during the presentation. Do not rely
  entirely on live AI processing during the demo.

## Team Allocation

| Person | Phases | Responsibility |
|---|---|---|
| A — AI Engineer | 2, 3 | Audio → Transcript → Intelligence |
| B — Backend Engineer | 0, 1, 4, 5, backend part of 7 | Infrastructure → Processing → DB → Knowledge Graph → APIs |
| C — Frontend Engineer | 6, frontend part of 7 | APIs → Dashboard → Graph → Chat → UX |
| D — QA/Integration/Demo | 8, 9 | + continuous code review, API contract review, integration testing, bug tracking, demo prep |

## Dependency Chain

```text
             ┌───────────────┐
             │   Frontend C  │
             └───────┬───────┘
                     │ REST API
                     ▼
             ┌───────────────┐
             │   Backend B   │
             └───────┬───────┘
                     │
              Celery Pipeline
                     │
                     ▼
             ┌───────────────┐
             │      A        │
             │  AI Pipeline  │
             └───────┬───────┘
                     │
                     ▼
              Structured JSON
                     │
                     ▼
             ┌───────────────┐
             │    Neo4j B    │
             └───────┬───────┘
                     │
                     ▼
             ┌───────────────┐
             │  Frontend C   │
             │ Graph / Chat  │
             └───────────────┘

                     ↑
                     │
             ┌───────┴───────┐
             │      D        │
             │ QA / Testing  │
             └───────────────┘
```

## The Critical MVP (最关键的 MVP)

如果时间不够，不要尝试完成所有 Phase 9 的 polish。你们最少必须保证这一条链完整：

**Upload → ASR → Gemini → Neo4j → Summary → Graph → Chat**

只要这条链稳定，你们就已经有一个完整的 Corporate Brain prototype；Timeline、Export、
复杂 Search、漂亮 UI 都属于第二优先级。

## Status

- [x] Task 0.1 — Initialize Monorepo (backend `app/` layout, `storage/`,
      `tests/`, Dockerfiles, frontend `src/` subdirs)
- [x] Task 0.2 — Configuration (`app/core/config.py`, `.env.example`)
- [~] Task 0.3 — Logging foundation done (`app/core/logger.py`: `app.log` /
      `worker.log` / `error.log`, wired into `app/main.py` startup). Not yet
      wired: HTTP request logging (explicitly Task 0.4's job below),
      Celery task logging (needs 0.6 to exist), Neo4j/DB error logging
      (needs 4.x/1.2 to exist) — each lands with its own task, not retrofit
      onto 0.3.
- [ ] Task 0.4 — FastAPI Initialization (CORS, exception handling, routers, request logging)
- [ ] Task 0.5 — Docker Compose
- [ ] Task 0.6 — Celery + Redis
- [ ] Everything from Phase 1 onward
