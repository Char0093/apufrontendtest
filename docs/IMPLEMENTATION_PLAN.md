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

`{summary, decisions: [{title, reason, evidence, confidence}], action_items: [{task, assignee, deadline}], risks, knowledge_triples: [{subject, predicate, object}]}`.

`confidence` is one of `firm_commitment | soft_agreement | unresolved` — shown
as a tag on every decision in the UI (Task 6.4).

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

Nodes: `(:Meeting) (:Person) (:Decision) (:ActionItem) (:Project) (:Policy) (:Document)`.
Relationships: `PARTICIPATED_IN, MADE_IN, ASSIGNED_TO, RELATES_TO, CONTRADICTS
(Decision→Decision), VIOLATES (Decision→Policy)`.

`Policy`/`Document`/`VIOLATES` only need to exist if Task 4.4 (below)
actually produces a policy-conflict flag — don't pre-populate policies by
hand, that's out of scope; the schema just needs to support it when it
happens.

### Task 4.3 — Graph Builder

Input: `MeetingAnalysis` → Meeting → Persons → Decisions → Action Items →
Projects → Relationships. Use `MERGE` to prevent duplicates.

### Task 4.4 — Contradiction & Flag Detection

**This is the flagship differentiator — the feature the whole "not just a
transcription tool" pitch depends on.** For each newly-extracted decision,
compare it against every past decision already in the graph and raise a
Flag if relevant.

Flag shape: `{id, meeting_id, type, severity, message, detail,
contradicts_meeting, contradicts_decision}`.
- `type`: `contradiction | duplicate_discussion | policy_conflict | missing_stakeholder`
- `severity`: `critical | warning | info`

Two implementation paths, pick based on time available:
- **Demo path (do this first):** keyword/topic matching — e.g. a new
  decision mentioning "vendor"/"budget increase" against a past decision
  containing "freeze"/"halt"/"pause" → flag it. Cheap, deterministic,
  enough to make the two-contradicting-meetings demo work.
- **Real path (if time allows):** embed decisions (any vector store —
  ChromaDB is fine locally, doesn't need to be in Docker Compose) and use
  Gemini to judge whether two semantically-similar decisions actually
  contradict, not just resemble each other.

On a real contradiction, write `(:Decision)-[:CONTRADICTS]->(:Decision)` (or
`VIOLATES` for a policy conflict) back into the graph — this is what makes
the flag visible on the Memory Graph page (Task 6.6) and the Meeting Detail
flags banner (Task 6.3).

### Task 4.5 — Graph Verification

`MATCH (n) RETURN n LIMIT 50` — verify the expected relationship shapes
exist, including at least one `CONTRADICTS` edge from the seed dataset
(Task 7.3).

## PHASE 5 — Backend APIs

- **5.1** `GET /meetings` — filters: keyword, project, participant, date
- **5.2** `GET /meeting/{id}/transcript` — speaker-attributed transcript
- **5.3** `GET /meeting/{id}/summary` — summary, decisions (with `confidence`),
  action_items, risks, **flags** (from Task 4.4, each with a link to the
  meeting/decision it conflicts with)
- **5.4** `GET /meeting/{id}/graph-data` — `{nodes: [], links: []}` for
  `react-force-graph`; a `CONTRADICTS` link sets `isContradiction: true` so
  the frontend can render it distinctly (Task 6.6)
- **5.5** `POST /query` — NL question → predefined Cypher template →
  `{answer, results, cypher}` (Cypher transparency) — this is "Ask Coco"
  (Task 6.7)'s backend; stays template-based, not swapped for vector
  search/RAG
- **5.6** `GET /users/{id}/dashboard` — `{action_items: [...], flags: [...],
  upcoming_meetings: [...]}`, filtered to that user's own commitments and
  the flags relevant to them — powers the personal Dashboard (Task 6.8).
  No real auth (Task 0.2 has no user/session concept) — hardcode/mock
  which "user" is logged in for the demo.

## PHASE 6 — React Frontend

Site nav (left side menu, fixed, 5 items): **Dashboard, Meetings, Memory
Graph, Ask Coco, Settings**. Dashboard (6.8) is the landing page — Meeting
List (6.1) is reached via the "Meetings" nav item, not the homepage.

- **6.1** Meeting List (`/meetings` — upload button, recent meetings w/ status)
- **6.2** Upload UI (drag & drop, title, project, uploading/processing states)
- **6.3** Meeting Detail (tabs: Summary / Transcript / Graph / Chat) — flags
  banner at top if Task 4.4 raised any, each saying *why* and linking to
  the conflicting meeting
- **6.4** Summary View (decisions w/ `confidence` tag, action items w/
  assignee + deadline, risks)
- **6.5** Transcript View (timestamped, speaker-attributed, click-to-highlight)
- **6.6** Memory Graph (`react-force-graph`, zoom/drag/click/highlight;
  `CONTRADICTS` edges rendered distinctly, e.g. red dashed line — this is
  the visual "wow" screen, keep the sample dataset small/curated so it
  never renders as an unreadable hairball)
- **6.7** Ask Coco (chat: ask questions, see AI answers with citations
  back to the source meeting — same Cypher-template backend as before,
  just renamed/rebranded)
- **6.8** Dashboard (`/dashboard`, landing page) — greeting header, the
  current user's own action items (task/deadline/source meeting/status/
  priority), an "AI Flags relevant to you" widget, upcoming meetings.
  Data: Task 5.6.
- **6.9** Settings & Roadmap (`/settings`) — mocked user profile (name,
  email — no real login, Task 0.2 has no auth), static org info. Plus an
  "Integrations & Roadmap" section: **Google OAuth Login** and **Live
  Meeting Rooms** ("Coco joins your meetings live") shown as real-looking
  but disabled/"coming soon" cards — UI only, no backend behind either.
  This is deliberate: both are real, substantial subsystems (an auth
  system; real-time browser audio capture) that we're not building for
  this hackathon, but they're visible enough in a live demo that silently
  omitting them would raise questions — this page answers "yes, we know,
  it's on the roadmap" without having to build either.

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

**Upload → ASR → Gemini → Contradiction Check → Neo4j → Summary → Graph → Ask Coco**

Contradiction Check（Task 4.4）现在是链条的一部分，不是可选项——这是整个 pitch
的差异化卖点（"不只是转录工具"），至少要跑通 demo path（关键词匹配），不需要真的
接 ChromaDB。Dashboard（6.8）、Settings/Roadmap（6.9）、Timeline、Export、复杂
Search、漂亮 UI 都属于第二优先级。

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
- [x] Task 0.4 — FastAPI Initialization (`GET /health`, CORS via
      `app/core/middleware.py`, `app/core/exceptions.py`'s catch-all
      exception handler, `app/api/` router aggregation, request logging —
      this closes the gap noted in 0.3 above)
- [x] Task 0.5 — Docker Compose (`docker-compose.yml`: redis, neo4j,
      fastapi-backend, celery-worker, frontend-dev on a shared network).
      `celery-worker` needed a minimal `app/core/celery_app.py` to exist
      (broker/backend only, no tasks) since it's listed here but
      `process_meeting_task` is Task 0.6's job — verified via a real
      `docker compose up`, not just static config.
- [x] Task 0.6 — Celery + Redis (`app/tasks/meeting_tasks.py`:
      `process_meeting_task(meeting_id)`, a stub — logs only, since the
      actual pipeline stages it will orchestrate don't exist until Phase
      1-4). Verified the full chain for real: dispatched a task from a
      separate process, confirmed the worker received and executed it
      (SUCCESS), and that its log line landed in `worker.log`.
- [x] Phase 1 — Meeting Ingestion. `app/services/storage_service.py`
      (Task 1.1); `app/database/session.py` + `app/models/meeting.py`
      (Task 1.2, `Meeting`/`ProcessingTask`, `create_all` on startup);
      `app/api/meetings.py` (Tasks 1.3/1.4/1.5 — `POST /meetings`,
      `POST /upload`, `GET /task/{id}/status`); `app/tasks/meeting_tasks.py`
      extended with real status transitions + retry/backoff (Task 1.6,
      `max_retries=2`, exponential countdown). Verified for real: uploaded
      a file through a running server with Redis + a live worker, watched
      status go pending -> completed with the file saved to `storage/raw/`;
      separately forced a permanent failure and confirmed 3 total attempts
      (retry_count reaches 2) before landing on `failed` with the error
      message persisted. Also caught and fixed a real bug during this: the
      original retry code committed the "retrying" status *before* calling
      `self.retry()`, inside a `try` that only caught
      `MaxRetriesExceededError` — a failed commit there would have crashed
      the task instead of retrying it.
- [ ] Everything from Phase 2 onward
