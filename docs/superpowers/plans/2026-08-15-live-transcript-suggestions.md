# Live Transcript Streaming + Proactive Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, speaker-labeled live caption feed and real-time contradiction suggestions to Live Meeting Rooms, and persist an ended call (if captions were used) into the same Meeting Intelligence pipeline uploads already go through.

**Architecture:** Each participant's browser streams its own mic audio to a new backend WebSocket (`/live-meeting/{room}/session`), which proxies to Deepgram's live streaming API and tags results with that connection's LiveKit-verified identity. Captions/suggestions fan out to other participants via LiveKit's existing data channel (same pattern as the whiteboard). On the last participant leaving, accumulated segments feed into the existing Gemini-extraction → graph-build pipeline through a new, narrow entry point.

**Tech Stack:** FastAPI WebSockets, `websockets` (Deepgram client), `livekit-api` (token verification), Celery/Redis, existing ChromaDB/Gemini contradiction stack, React + `@livekit/components-react`.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-08-15-live-transcript-suggestions-design.md` (read it in full before starting — the two "Revisions" sections explain *why* each constraint exists):

- WS path is `WS /live-meeting/{room_name}/session` — **no query params**. The LiveKit token is sent as the first WS frame: `{"type": "auth", "token": "..."}`. Reject anything else as the first frame.
- The session WS **must accept connections with no `DEEPGRAM_API_KEY` configured** — only a `captions_on` control message may be rejected for that reason. Presence/session tracking is independent of Deepgram.
- `GET /live-meeting/{room_name}/transcript-so-far` requires `Authorization: Bearer <token>`, verified the same way, including a `claims.video.room == room_name` check.
- `contradiction_service.Flag` gains `judge: str = "llm"`, set to `"keyword_fallback"` when the demo/keyless judge path produced it. Every existing call site must keep working unchanged (default value).
- `check_decisions()`'s existing behavior/tests must be unchanged after extracting `check_text()`.
- `process_live_meeting_task` takes **only** `meeting_id` — never the transcript itself (avoids bloating Redis, which is both broker and result backend here).
- No new `Meeting` DB columns. Reuse `title`/`date`/`duration` (all already nullable strings).
- Deepgram query string: `model=nova-2&smart_format=true&interim_results=true&punctuate=true&language=en` — **no** `encoding`/`sample_rate` (audio is WebM/Opus, container-detected).
- `websockets` must be an explicit line in `backend/requirements.txt` (currently only present transitively via `uvicorn[standard]`).
- Every commit uses Conventional Commits.
- Scope is `frontend/src/components/MeetingRoomView.tsx` + a new backend slice. Do **not** touch `KnowledgeGraphView.tsx`/`MemoryGraphView.tsx`/`CocoChatView.tsx`/`MeetingDetailView.tsx` even though `Flag.judge` now exists — labeling the demo judge in those views is out of this plan's scope.
- Mic capture must use the **same** `MediaStreamTrack` LiveKit already publishes (via `useTracks`), not a separate `getUserMedia()` call, and must stop whenever `isMicrophoneEnabled` is `false`.
- A participant's own caption/suggestion renders locally immediately from its own WS response — never only via the LiveKit `DataReceived` round-trip.

---

## File Structure

**Backend — new:**
- `backend/app/services/live_transcription_service.py` — Deepgram live-streaming proxy (connect, forward audio, KeepAlive, parse results into a queue).
- `backend/app/api/live_meeting.py` — the session WebSocket, transcript-so-far GET, in-memory session registry, keyword gate, finalization.
- `backend/tests/test_live_transcription_service.py`
- `backend/tests/test_contradiction_service.py`
- `backend/tests/test_live_meeting.py`

**Backend — modified:**
- `backend/requirements.txt` — add `websockets`.
- `backend/app/schemas/meeting_intelligence.py` — add `Flag.judge`.
- `backend/app/graph/contradiction_service.py` — extract `check_text()`, add demo-safe fallback judge.
- `backend/app/services/storage_service.py` — add `save_live_segments`/`get_live_segments`.
- `backend/app/tasks/meeting_tasks.py` — extract `_analyze_transcript()` and the generic `_process_meeting()` shell; add `process_live_meeting_task`.
- `backend/app/api/__init__.py` — register the new router.

**Frontend — new:**
- `frontend/src/hooks/useLiveMeetingSession.ts` — the session WS, mic capture, local echo + LiveKit fan-out (this is genuinely shared state consumed by two sibling components, which is what justifies a new `hooks/` directory the codebase doesn't otherwise use yet — see Task 6).
- `frontend/src/components/LiveTranscriptPanel.tsx`
- `frontend/src/components/LiveSuggestionBanner.tsx`

**Frontend — modified:**
- `frontend/src/components/MeetingRoomView.tsx` — thread the LiveKit token down to `RoomContent`, add the toggle button, mount the panel/banner.

---

### Task 1: Deepgram live-streaming proxy

**Files:**
- Create: `backend/app/services/live_transcription_service.py`
- Modify: `backend/requirements.txt` (add `websockets` after line 9, `python-multipart==0.0.32`)
- Test: `backend/tests/test_live_transcription_service.py`

**Interfaces:**
- Produces: `open_connection() -> DeepgramLiveConnection` (async; raises `ValueError` if `settings.deepgram_api_key` is empty). `DeepgramLiveConnection.send_audio(chunk: bytes) -> None` (async). `DeepgramLiveConnection.results: asyncio.Queue[str]` — finalized transcript strings land here. `DeepgramLiveConnection.close() -> None` (async).

- [ ] **Step 1: Add the explicit dependency**

In `backend/requirements.txt`, after the `python-multipart==0.0.32` line, add:

```text
websockets==16.1
```

(`websockets` is already present transitively via `uvicorn[standard]` at v16.1.1 in this project's `.venv` — pinning it explicitly stops that from being implicit/fragile.)

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_live_transcription_service.py`:

```python
import asyncio
import json

import pytest

from app.core.config import Settings
from app.services import live_transcription_service


def test_open_connection_raises_without_api_key(monkeypatch):
    monkeypatch.setattr(
        live_transcription_service, "settings", Settings(_env_file=None, neo4j_password="x", deepgram_api_key="")
    )
    with pytest.raises(ValueError, match="DEEPGRAM_API_KEY"):
        asyncio.run(live_transcription_service.open_connection())


class _FakeDeepgramSocket:
    """Minimal async-iterable stand-in for a websockets connection."""

    def __init__(self, messages):
        self._messages = messages

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._messages:
            raise StopAsyncIteration
        return self._messages.pop(0)


def test_read_results_only_queues_final_transcripts():
    messages = [
        json.dumps({"type": "Metadata"}),
        json.dumps({"channel": {"alternatives": [{"transcript": "hello wo"}]}, "is_final": False}),
        json.dumps({"channel": {"alternatives": [{"transcript": "hello world"}]}, "is_final": True}),
        json.dumps({"channel": {"alternatives": [{"transcript": ""}]}, "is_final": True}),
    ]
    fake_ws = _FakeDeepgramSocket(messages)
    results: asyncio.Queue = asyncio.Queue()

    asyncio.run(live_transcription_service._read_results(fake_ws, results))

    assert results.qsize() == 1
    assert results.get_nowait() == "hello world"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_live_transcription_service.py -v`
Expected: FAIL with `ModuleNotFoundError` / `AttributeError` (`live_transcription_service` doesn't exist yet).

- [ ] **Step 4: Implement `live_transcription_service.py`**

Create `backend/app/services/live_transcription_service.py`:

```python
"""Thin proxy to Deepgram's live streaming WebSocket. One connection per
participant, opened lazily on captions_on. See
docs/superpowers/specs/2026-08-15-live-transcript-suggestions-design.md.
"""
import asyncio
import json
import logging
import time

import websockets

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_DEEPGRAM_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2&smart_format=true&interim_results=true&punctuate=true&language=en"
)
_KEEPALIVE_INTERVAL_SECONDS = 8


class DeepgramLiveConnection:
    def __init__(self, ws) -> None:
        self._ws = ws
        self.results: asyncio.Queue[str] = asyncio.Queue()
        self._last_audio_sent = time.monotonic()
        self._reader_task: asyncio.Task | None = None
        self._keepalive_task: asyncio.Task | None = None

    async def send_audio(self, chunk: bytes) -> None:
        await self._ws.send(chunk)
        self._last_audio_sent = time.monotonic()

    async def close(self) -> None:
        if self._reader_task is not None:
            self._reader_task.cancel()
        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
        await self._ws.close()


async def _read_results(ws, results: "asyncio.Queue[str]") -> None:
    """Only Deepgram's *finalized* results are queued — interim results are
    for a client-side typing indicator only, never the durable transcript."""
    try:
        async for raw in ws:
            data = json.loads(raw)
            channel = data.get("channel")
            if not channel:
                continue
            alternatives = channel.get("alternatives") or [{}]
            text = alternatives[0].get("transcript", "")
            if text and data.get("is_final"):
                await results.put(text)
    except Exception as exc:
        logger.warning("Deepgram live connection reader stopped: %s", exc)


async def _send_keepalive(connection: DeepgramLiveConnection) -> None:
    """Deepgram's live socket can time out during a pause in speech with no
    audio and no KeepAlive. Sends one only when audio has actually been idle
    for the interval, so it never fights with real traffic."""
    try:
        while True:
            await asyncio.sleep(_KEEPALIVE_INTERVAL_SECONDS)
            if time.monotonic() - connection._last_audio_sent >= _KEEPALIVE_INTERVAL_SECONDS:
                await connection._ws.send(json.dumps({"type": "KeepAlive"}))
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.warning("Deepgram keepalive stopped: %s", exc)


async def open_connection() -> DeepgramLiveConnection:
    if not settings.deepgram_api_key:
        raise ValueError("DEEPGRAM_API_KEY is not set.")
    ws = await websockets.connect(
        _DEEPGRAM_URL,
        additional_headers={"Authorization": f"Token {settings.deepgram_api_key}"},
    )
    connection = DeepgramLiveConnection(ws)
    connection._reader_task = asyncio.create_task(_read_results(ws, connection.results))
    connection._keepalive_task = asyncio.create_task(_send_keepalive(connection))
    return connection
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_live_transcription_service.py -v`
Expected: `2 passed`

- [ ] **Step 6: De-risk the actual audio format against real Deepgram (manual, one-time)**

This is the spike the design review called out as the single remaining unverified risk (LiveKit token verification was already confirmed during brainstorming — this is the only one left). Not automatable without a real speech sample and a real API key, so it isn't a `pytest` step:

1. Record ~5 seconds of yourself saying a short, distinct phrase (e.g. "testing one two three, live transcript check") using any tool that outputs WebM/Opus — the simplest is a throwaway HTML page: `<input type="file">`-free, just open a browser console on any page and run:
   ```js
   navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
     const chunks = []; const rec = new MediaRecorder(stream, {mimeType: 'audio/webm;codecs=opus'});
     rec.ondataavailable = e => chunks.push(e.data);
     rec.onstop = () => { const blob = new Blob(chunks, {type: 'audio/webm'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sample.webm'; a.click(); };
     rec.start(250); setTimeout(() => rec.stop(), 5000);
   });
   ```
2. Save the downloaded file as `backend/tests/fixtures/live_speech_sample.webm`.
3. With a real `DEEPGRAM_API_KEY` set in `backend/.env`, run this one-off check (not part of the automated suite — delete after confirming):
   ```python
   import asyncio
   from pathlib import Path
   from app.services import live_transcription_service

   async def main():
       conn = await live_transcription_service.open_connection()
       data = Path("tests/fixtures/live_speech_sample.webm").read_bytes()
       chunk_size = 4000
       for i in range(0, len(data), chunk_size):
           await conn.send_audio(data[i:i + chunk_size])
           await asyncio.sleep(0.1)
       await asyncio.sleep(2)
       while not conn.results.empty():
           print("TRANSCRIPT:", conn.results.get_nowait())
       await conn.close()

   asyncio.run(main())
   ```
   Confirm real, recognizable words print. If nothing transcribes, the chunking/format needs adjustment before Task 4/5 build on top of it — this is exactly why it's de-risked first.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/app/services/live_transcription_service.py backend/tests/test_live_transcription_service.py
git commit -m "feat(backend): add Deepgram live-streaming proxy service"
```

---

### Task 2: Contradiction judge refactor + demo-safe fallback

**Files:**
- Modify: `backend/app/schemas/meeting_intelligence.py:66-72` (the `Flag` class)
- Modify: `backend/app/graph/contradiction_service.py` (whole file — extraction + new fallback)
- Test: `backend/tests/test_contradiction_service.py` (new)

**Interfaces:**
- Consumes: `embedding_service.query_similar_decisions(text, exclude_meeting_id, n_results) -> list[dict]` (existing, unchanged).
- Produces: `contradiction_service.check_text(text: str, exclude_meeting_id: str) -> Flag | None`. `Flag.judge: str` (`"llm"` default, `"keyword_fallback"` for the demo path).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_contradiction_service.py`:

```python
from app.core.config import Settings
from app.graph import contradiction_service
from app.schemas.meeting_intelligence import Decision, DecisionConfidence, Flag, FlagType


def _decision(text: str) -> Decision:
    return Decision(text=text, confidence=DecisionConfidence.firm_commitment, timestamp="00:00:00", speaker="Alex")


def test_check_decisions_still_flags_via_check_text(monkeypatch):
    """Regression: check_decisions()'s existing behavior must survive the
    check_text() extraction unchanged."""
    monkeypatch.setattr(
        contradiction_service,
        "check_text",
        lambda text, exclude_meeting_id: Flag(type=FlagType.contradiction, message="conflict", judge="llm"),
    )

    flags = contradiction_service.check_decisions("mtg-2", [_decision("Approve the vendor increase")])

    assert len(flags) == 1
    assert flags[0].message == "conflict"


def test_check_text_returns_none_when_nothing_similar(monkeypatch):
    monkeypatch.setattr(contradiction_service.embedding_service, "query_similar_decisions", lambda *a, **k: [])

    assert contradiction_service.check_text("Approve the budget", exclude_meeting_id="mtg-1") is None


def test_check_text_skips_matches_beyond_distance_threshold(monkeypatch):
    monkeypatch.setattr(
        contradiction_service.embedding_service,
        "query_similar_decisions",
        lambda *a, **k: [{"text": "unrelated", "meeting_id": "mtg-0", "distance": 0.9}],
    )
    called = {"judge": False}

    def fake_judge(*a, **k):
        called["judge"] = True
        return "should not run"

    monkeypatch.setattr(contradiction_service, "_judge_contradiction", fake_judge)

    assert contradiction_service.check_text("Approve the budget", exclude_meeting_id="mtg-1") is None
    assert called["judge"] is False


def test_demo_safe_judge_fallback_flags_opposing_terms(monkeypatch):
    """Neither key configured — the flagship live-suggestion moment must not
    silently no-op in a keyless demo."""
    monkeypatch.setattr(
        contradiction_service,
        "settings",
        Settings(_env_file=None, neo4j_password="x", gemini_api_key="", agnes_api_key=""),
    )
    monkeypatch.setattr(
        contradiction_service.embedding_service,
        "query_similar_decisions",
        lambda *a, **k: [{"text": "Freeze all vendor spending", "meeting_id": "mtg-0", "distance": 0.1}],
    )

    flag = contradiction_service.check_text("Approve a budget increase for the vendor", exclude_meeting_id="mtg-1")

    assert flag is not None
    assert flag.judge == "keyword_fallback"
    assert flag.contradicts_meeting_id == "mtg-0"


def test_llm_judge_flag_defaults_to_llm(monkeypatch):
    monkeypatch.setattr(
        contradiction_service.embedding_service,
        "query_similar_decisions",
        lambda *a, **k: [{"text": "Freeze all vendor spending", "meeting_id": "mtg-0", "distance": 0.1}],
    )
    monkeypatch.setattr(contradiction_service, "_judge_contradiction", lambda *a, **k: ("Direct conflict", "llm"))

    flag = contradiction_service.check_text("Approve a budget increase", exclude_meeting_id="mtg-1")

    assert flag is not None
    assert flag.judge == "llm"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_contradiction_service.py -v`
Expected: FAIL (`check_text` doesn't exist yet, `Flag` has no `judge` field).

- [ ] **Step 3: Add `Flag.judge`**

In `backend/app/schemas/meeting_intelligence.py`, replace the `Flag` class (lines 66-72):

```python
class Flag(BaseModel):
    type: FlagType
    message: str
    severity: str = "warning"
    source_decision_text: Optional[str] = None
    contradicts_meeting_id: Optional[str] = None
    contradicts_decision_text: Optional[str] = None
    judge: str = "llm"
```

- [ ] **Step 4: Rewrite `contradiction_service.py`**

Replace `backend/app/graph/contradiction_service.py` in full:

```python
"""Contradiction detection (Task 4.4, real path): embed each new decision,
find similar past decisions from OTHER meetings via ChromaDB, then ask a
judge whether they actually conflict (not just topically similar). On a
real contradiction, returns a Flag for the Phase 5.3 summary response —
and, since 2026-08-15, for live in-call suggestions too (check_text()).

This module only detects — it does not write to Neo4j. The CONTRADICTS edge
needs both Decision nodes to already exist, and this meeting's own decision
nodes aren't created until app.graph.graph_builder.build_from_meeting() runs
(after this check), so app.tasks.meeting_tasks writes the edges once nodes
exist, using each Flag's source_decision_text/contradicts_decision_text.
"""
import json
import logging
from typing import Optional

from app.core.config import get_settings
from app.schemas.meeting_intelligence import Decision, Flag, FlagType
from app.services import embedding_service
from app.services.gemini_service import call_agnes_api

logger = logging.getLogger(__name__)
settings = get_settings()

# ChromaDB cosine distance — lower means more similar. Decisions further
# apart than this are treated as unrelated and never sent to the judge call.
_SIMILARITY_DISTANCE_THRESHOLD = 0.6

# Demo-safe fallback judge (Task 4.4's original "Demo path", re-enabled for
# the case neither Gemini nor Agnes is configured — the LLM judge below
# fails closed to None in that case, which would make live suggestions
# silently never fire in a keyless demo). Each pair is checked both ways.
_OPPOSING_TERM_PAIRS = (
    ("approve", "reject"), ("approved", "rejected"), ("increase", "freeze"),
    ("increase", "halt"), ("proceed", "halt"), ("proceed", "pause"),
    ("hire", "layoff"), ("hire", "freeze"), ("expand", "cut"),
    ("continue", "cancel"), ("renew", "terminate"),
)


def _keyword_fallback_judge(new_text: str, past_text: str) -> Optional[str]:
    new_lower, past_lower = new_text.lower(), past_text.lower()
    for term_a, term_b in _OPPOSING_TERM_PAIRS:
        if (term_a in new_lower and term_b in past_lower) or (term_b in new_lower and term_a in past_lower):
            return f'Pattern-matched opposing terms ("{term_a}" vs "{term_b}") — not an AI-verified judgment.'
    return None


def _judge_contradiction(new_text: str, past_text: str) -> Optional[tuple[str, str]]:
    """Ask an LLM whether two similar decisions actually contradict; falls
    back to a deterministic keyword judge when no LLM key is configured at
    all (not just when a call happens to fail). Returns (reason, judge) —
    judge is "llm" or "keyword_fallback" — or None if no contradiction is
    found either way."""
    if not settings.gemini_api_key and not settings.agnes_api_key:
        reason = _keyword_fallback_judge(new_text, past_text)
        return (reason, "keyword_fallback") if reason else None

    prompt = f"""Two organizational decisions, possibly from different meetings:

Decision A (new): "{new_text}"
Decision B (earlier): "{past_text}"

Do these two decisions genuinely conflict with each other (one contradicts,
reverses, or undermines the other) — as opposed to merely being about a
similar topic? Return ONLY JSON: {{"contradicts": true/false, "reason": "one sentence why"}}.
"""
    try:
        raw = ""
        if settings.gemini_api_key:
            from google import genai

            client = genai.Client(api_key=settings.gemini_api_key)
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
            raw = response.text
        elif settings.agnes_api_key:
            raw = call_agnes_api([{"role": "user", "content": prompt}])

        if not raw:
            return None

        raw = raw.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:-1])
        data = json.loads(raw)
        if data.get("contradicts"):
            return data.get("reason", "Flagged as a likely contradiction."), "llm"
        return None
    except Exception as e:
        logger.warning(f"Contradiction judge call failed: {e}")
        return None


def check_text(text: str, exclude_meeting_id: str) -> Optional[Flag]:
    """Embed `text`, find similar past decisions from other meetings, ask
    the judge whether they genuinely conflict. Returns a Flag on a real
    contradiction, None otherwise (including on any failure — fails closed).
    Used both by check_decisions() below (post-call) and live_meeting.py
    (during a call)."""
    matches = embedding_service.query_similar_decisions(text, exclude_meeting_id=exclude_meeting_id, n_results=3)
    for match in matches:
        if match["distance"] > _SIMILARITY_DISTANCE_THRESHOLD:
            continue

        judged = _judge_contradiction(text, match["text"])
        if not judged:
            continue
        reason, judge = judged

        return Flag(
            type=FlagType.contradiction,
            message=reason,
            severity="warning",
            source_decision_text=text,
            contradicts_meeting_id=match["meeting_id"],
            contradicts_decision_text=match["text"],
            judge=judge,
        )
    return None


def check_decisions(meeting_id: str, decisions: list[Decision]) -> list[Flag]:
    """For each new decision, look for a genuine contradiction among past
    decisions from other meetings (their embeddings must already be indexed
    via embedding_service.index_meeting for prior meetings). Returns any
    Flags found; does not mutate the input list."""
    flags: list[Flag] = []
    for decision in decisions:
        flag = check_text(decision.text, exclude_meeting_id=meeting_id)
        if flag is not None:
            flags.append(flag)
            logger.info(f"[{meeting_id}] Contradiction flagged against {flag.contradicts_meeting_id}: {flag.message}")
    return flags
```

Note the behavior change from the original: the old `check_decisions()` did `break` after the first matching decision-vs-match pair (one flag per new decision). `check_text()` preserves that — it returns on the *first* match that clears both the distance threshold and the judge, exactly like the original inner loop did.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_contradiction_service.py -v`
Expected: `5 passed`

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest -v`
Expected: all previously-passing tests (22 before this task) still pass, plus the new ones.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/meeting_intelligence.py backend/app/graph/contradiction_service.py backend/tests/test_contradiction_service.py
git commit -m "refactor(backend): extract contradiction_service.check_text with a demo-safe fallback judge"
```

---

### Task 3: `meeting_tasks.py` refactor — shared analysis + live task

**Files:**
- Modify: `backend/app/services/storage_service.py:6` (`_SUBDIRS` — no change needed, reuses `raw/`) and append two methods.
- Modify: `backend/app/tasks/meeting_tasks.py` (whole file)
- Test: extend `backend/tests/test_phase_contracts.py`

**Interfaces:**
- Consumes: `contradiction_service.check_decisions` (Task 2, signature unchanged).
- Produces: `storage_service.StorageService.save_live_segments(meeting_id: str, segments: list[dict]) -> str`, `.get_live_segments(meeting_id: str) -> list[dict]`. `meeting_tasks._analyze_transcript(meeting: Meeting, segments: list[dict], on_progress, name_timestamps: dict | None = None, all_detected_names: list[str] | None = None) -> MeetingIntelligence`. `meeting_tasks.process_live_meeting_task` (Celery task, `.delay(meeting_id: str)`).

- [ ] **Step 1: Add `save_live_segments`/`get_live_segments`**

In `backend/app/services/storage_service.py`, add after `save_transcript` (after line 29):

```python
    def save_live_segments(self, meeting_id: str, segments: list[dict]) -> str:
        """Raw segments captured live, before Gemini extraction — read back
        by process_live_meeting_task. Lives under raw/ alongside uploaded
        files: both are "the raw input for this meeting", just a different
        format when there's no uploaded file at all."""
        relative_path = f"raw/{meeting_id}_live.json"
        (self.base_path / relative_path).write_text(json.dumps(segments, indent=2))
        return relative_path

    def get_live_segments(self, meeting_id: str) -> list[dict]:
        relative_path = f"raw/{meeting_id}_live.json"
        return json.loads((self.base_path / relative_path).read_text())
```

- [ ] **Step 2: Write the failing tests**

Append to `backend/tests/test_phase_contracts.py` (add these imports to the top alongside the existing ones, then the tests at the end of the file):

```python
from unittest.mock import MagicMock

from app.models.meeting import Meeting
from app.services.storage_service import StorageService
from app.tasks import meeting_tasks


def test_storage_round_trips_live_segments(tmp_path):
    storage = StorageService(base_path=str(tmp_path))
    segments = [{"speaker": "Alex", "identity": "alex-123", "text": "hello", "timestamp": "00:00:01", "start": 1.2}]

    storage.save_live_segments("mtg-live-1", segments)

    assert storage.get_live_segments("mtg-live-1") == segments


def test_analyze_transcript_produces_intelligence_without_a_video_file(monkeypatch):
    """Live sessions have no video file to run Vision on — _analyze_transcript
    must work correctly with name_timestamps/all_detected_names omitted."""
    monkeypatch.setattr(
        meeting_tasks.gemini_service,
        "run_gemini_analysis",
        lambda transcript_text, names: {
            "summary": "Quick sync",
            "participants": ["Alex Chen"],
            "speaker_map": {},
            "decisions": [],
            "action_items": [],
            "risks": [],
            "knowledge_triples": [],
        },
    )
    monkeypatch.setattr(meeting_tasks.embedding_service, "index_meeting", lambda *a, **k: None)
    monkeypatch.setattr(meeting_tasks.contradiction_service, "check_decisions", lambda *a, **k: [])

    meeting = Meeting(id="mtg-live-2", title="Live: team-sync", file_path=None)
    segments = [{"speaker": "Alex Chen", "identity": "alex-123", "text": "Let's sync quickly", "timestamp": "00:00:05", "start": 5.0}]

    intelligence = meeting_tasks._analyze_transcript(meeting, segments, on_progress=lambda *a: None)

    assert intelligence.meeting_id == "mtg-live-2"
    assert intelligence.summary == "Quick sync"
    assert intelligence.duration == "00:00:05"


def test_process_live_meeting_task_reads_segments_and_saves_graph(monkeypatch, tmp_path):
    storage = StorageService(base_path=str(tmp_path))
    monkeypatch.setattr(meeting_tasks, "storage", storage)

    db = meeting_tasks.SessionLocal()
    meeting = Meeting(id="mtg-live-3", title="Live: team-sync", file_path=None, status="pending")
    db.add(meeting)
    db.commit()
    db.close()

    storage.save_live_segments("mtg-live-3", [{"speaker": "Alex", "identity": "a", "text": "hi", "timestamp": "00:00:01", "start": 1.0}])

    fake_intelligence = MagicMock(decisions=[], action_items=[], flags=[])
    monkeypatch.setattr(meeting_tasks, "_analyze_transcript", lambda meeting, segments, on_progress: fake_intelligence)
    save_and_graph_calls = []
    monkeypatch.setattr(meeting_tasks, "_save_and_graph", lambda meeting, intelligence: save_and_graph_calls.append((meeting.id, intelligence)))

    meeting_tasks.process_live_meeting_task.run("mtg-live-3")

    assert save_and_graph_calls == [("mtg-live-3", fake_intelligence)]
    db = meeting_tasks.SessionLocal()
    updated = db.query(Meeting).filter(Meeting.id == "mtg-live-3").first()
    assert updated.status == "completed"
    db.close()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_phase_contracts.py -v`
Expected: FAIL (`save_live_segments`, `_analyze_transcript`, `process_live_meeting_task` don't exist yet).

- [ ] **Step 4: Rewrite `meeting_tasks.py`**

Replace `backend/app/tasks/meeting_tasks.py` in full:

```python
from pathlib import Path

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.core.logger import get_logger
from app.database.session import SessionLocal
from app.graph import contradiction_service, graph_builder
from app.models.meeting import Meeting, ProcessingTask
from app.schemas.meeting_intelligence import (
    ActionItem,
    Decision,
    MeetingIntelligence,
    TranscriptLine,
)
from app.services import asr_service, embedding_service, gemini_service, vision_service
from app.services.storage_service import StorageService

logger = get_logger("app.tasks", worker=True)
settings = get_settings()
storage = StorageService()

# Matches app.api.meetings.ALLOWED_EXTENSIONS' only video format — Vision
# (nameplate reading) only makes sense for uploads that actually have video.
_VIDEO_EXTENSIONS = (".mp4",)


def _get_or_create_task_record(db, meeting_id: str) -> ProcessingTask:
    task_record = db.query(ProcessingTask).filter(ProcessingTask.meeting_id == meeting_id).first()
    if task_record is None:
        task_record = ProcessingTask(meeting_id=meeting_id)
        db.add(task_record)
    return task_record


def _analyze_transcript(
    meeting: Meeting,
    segments: list[dict],
    on_progress,
    name_timestamps: dict | None = None,
    all_detected_names: list[str] | None = None,
) -> MeetingIntelligence:
    """Gemini extraction through contradiction detection — the part of the
    pipeline that's identical whether segments came from a Deepgram REST
    transcription of an uploaded file, or from a live call
    (app/api/live_meeting.py). No demo_mode branch here on purpose: that's
    _run_pipeline's job below, for the "no file at all" case — a live
    session always has real segments, so it always runs for real, relying
    on gemini_service's own multi-provider fallback chain for resilience
    rather than substituting unrelated canned data over a real conversation.
    """
    name_timestamps = name_timestamps or {}
    all_detected_names = all_detected_names or []
    transcript_text = "\n".join(f"[{s['timestamp']}] {s['speaker']}: {s['text']}" for s in segments)

    on_progress(60, "Extracting decisions and action items (Gemini)...")
    analysis_dict = gemini_service.run_gemini_analysis(transcript_text, all_detected_names)
    ai_speaker_map = {
        spk: name
        for spk, name in analysis_dict.get("speaker_map", {}).items()
        if name and "unknown" not in name.lower() and "speaker" not in name.lower()
    }
    speaker_map = vision_service.map_speakers_to_names(segments, name_timestamps, ai_speaker_map)
    for seg in segments:
        seg["speaker"] = speaker_map.get(seg["speaker"], seg["speaker"])

    last_sec = max((s.get("start", 0) for s in segments), default=0)
    h, m, sec = int(last_sec // 3600), int((last_sec % 3600) // 60), int(last_sec % 60)

    intelligence = MeetingIntelligence(
        meeting_id=meeting.id,
        duration=f"{h:02d}:{m:02d}:{sec:02d}",
        summary=analysis_dict.get("summary", ""),
        participants=analysis_dict.get("participants", list(set(speaker_map.values()))),
        speaker_map=speaker_map,
        transcript=[
            TranscriptLine(
                timestamp=s["timestamp"],
                speaker=s["speaker"],
                speaker_raw=s.get("speaker_raw", ""),
                text=s["text"],
            )
            for s in segments
        ],
        decisions=[Decision(**d) for d in analysis_dict.get("decisions", [])],
        action_items=[ActionItem(**a) for a in analysis_dict.get("action_items", [])],
        flags=[],
        risks=analysis_dict.get("risks", []),
        knowledge_triples=analysis_dict.get("knowledge_triples", []),
    )

    on_progress(75, "Indexing + checking for contradictions against past decisions...")
    embedding_service.index_meeting(meeting.id, meeting.title, intelligence)
    intelligence.flags = contradiction_service.check_decisions(meeting.id, intelligence.decisions)

    return intelligence


def _run_pipeline(meeting: Meeting, on_progress) -> MeetingIntelligence:
    """Runs the Phase 2-4 pipeline for one uploaded-file meeting (ASR ->
    Vision -> _analyze_transcript). Raises on failure; _process_meeting owns
    all DB status/retry handling."""
    if settings.demo_mode:
        on_progress(20, "Running demo pipeline (DEMO_MODE=true, no API calls)...")
        graph_builder.seed_demo_history()
        intelligence = gemini_service.demo_meeting_intelligence(meeting.id)
        on_progress(90, "Demo data ready")
        return intelligence

    raw_path = str((storage.base_path / meeting.file_path).resolve())
    audio_path = str(storage.base_path / "audio" / f"{meeting.id}.wav")

    on_progress(15, "Extracting audio...")
    audio_path = asr_service.extract_audio(raw_path, audio_path)

    on_progress(30, "Transcribing with Deepgram...")
    segments = asr_service.run_deepgram_transcription(audio_path)

    name_timestamps: dict = {}
    if Path(raw_path).suffix.lower() in _VIDEO_EXTENSIONS:
        on_progress(45, "Reading participant names from video (Vision)...")
        name_timestamps = vision_service.extract_names_from_video(raw_path)
    all_detected_names = list({n for names in name_timestamps.values() for n in names})

    return _analyze_transcript(meeting, segments, on_progress, name_timestamps, all_detected_names)


def _save_and_graph(meeting: Meeting, intelligence: MeetingIntelligence) -> None:
    """Persist transcript/summary (StorageService, Task 1.1) and build the
    graph (Task 4.3), then write any CONTRADICTS edges (Task 4.4) now that
    this meeting's own Decision nodes exist."""
    storage.save_transcript(meeting.id, {
        "meeting_id": meeting.id,
        "transcript": [line.model_dump() for line in intelligence.transcript],
    })
    storage.save_summary(meeting.id, {
        "duration": intelligence.duration,
        "summary": intelligence.summary,
        "participants": intelligence.participants,
        "decisions": [d.model_dump() for d in intelligence.decisions],
        "action_items": [a.model_dump() for a in intelligence.action_items],
        "flags": [f.model_dump() for f in intelligence.flags],
        "risks": intelligence.risks,
        "knowledge_triples": [triple.model_dump() for triple in intelligence.knowledge_triples],
    })

    graph_builder.build_from_meeting(meeting.id, meeting.title, meeting.project, intelligence)

    for flag in intelligence.flags:
        if flag.source_decision_text and flag.contradicts_meeting_id and flag.contradicts_decision_text:
            from_id = graph_builder.decision_node_id(meeting.id, flag.source_decision_text)
            to_id = graph_builder.decision_node_id(flag.contradicts_meeting_id, flag.contradicts_decision_text)
            graph_builder.write_contradiction(from_id, to_id, flag.message)


def _process_meeting(task, meeting_id: str, run_pipeline) -> None:
    """Generic status/retry shell shared by process_meeting_task and
    process_live_meeting_task below — the only thing that differs between
    an upload and a live call is how MeetingIntelligence gets produced."""
    logger.info(f"Processing meeting {meeting_id} (attempt {task.request.retries + 1})")
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if meeting is None:
            logger.error(f"Meeting {meeting_id} not found, aborting task")
            return

        task_record = _get_or_create_task_record(db, meeting_id)
        task_record.status = "processing"
        task_record.retry_count = task.request.retries
        meeting.status = "processing"
        meeting.progress = 5
        db.commit()

        def on_progress(pct: int, message: str) -> None:
            meeting.progress = pct
            db.commit()
            logger.info(f"[{meeting_id}] {pct}% — {message}")

        intelligence = run_pipeline(meeting, on_progress)
        _save_and_graph(meeting, intelligence)

        task_record.status = "completed"
        meeting.status = "completed"
        meeting.progress = 100
        db.commit()
        logger.info(
            f"Meeting {meeting_id} processing complete — {len(intelligence.decisions)} decisions, "
            f"{len(intelligence.action_items)} action items, {len(intelligence.flags)} flags"
        )

    except Exception as exc:
        db.rollback()
        logger.error(f"Meeting {meeting_id} processing failed: {exc}", exc_info=True)

        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        task_record = _get_or_create_task_record(db, meeting_id)
        task_record.error_message = str(exc)
        task_record.retry_count = task.request.retries

        is_final_attempt = task.request.retries >= task.max_retries
        task_record.status = "failed" if is_final_attempt else "retrying"
        if meeting is not None:
            meeting.status = "failed" if is_final_attempt else "retrying"
        db.commit()

        if is_final_attempt:
            logger.error(f"Meeting {meeting_id} failed after {task.request.retries + 1} attempts")
        else:
            raise task.retry(exc=exc, countdown=2**task.request.retries)
    finally:
        db.close()


@celery_app.task(bind=True, name="process_meeting_task", max_retries=2)
def process_meeting_task(self, meeting_id: str) -> None:
    _process_meeting(self, meeting_id, _run_pipeline)


@celery_app.task(bind=True, name="process_live_meeting_task", max_retries=2)
def process_live_meeting_task(self, meeting_id: str) -> None:
    """Entry point for a finished live call (app/api/live_meeting.py). Takes
    only the id — segments were already persisted via
    StorageService.save_live_segments before this was dispatched, so the
    Celery/Redis payload stays small regardless of call length."""

    def run_pipeline(meeting: Meeting, on_progress) -> MeetingIntelligence:
        segments = storage.get_live_segments(meeting_id)
        return _analyze_transcript(meeting, segments, on_progress)

    _process_meeting(self, meeting_id, run_pipeline)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_phase_contracts.py -v`
Expected: all pass, including the 3 new ones.

- [ ] **Step 6: Run the full suite to confirm the upload path is unchanged**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest -v`
Expected: all tests pass (was 27 after Task 2; should be 30 now).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/storage_service.py backend/app/tasks/meeting_tasks.py backend/tests/test_phase_contracts.py
git commit -m "refactor(backend): extract _analyze_transcript and a shared task shell for live meetings"
```

---

### Task 4: Session WebSocket — auth, presence, finalization

**Files:**
- Create: `backend/app/api/live_meeting.py`
- Modify: `backend/app/api/__init__.py:1-16`
- Test: `backend/tests/test_live_meeting.py` (new)

**Interfaces:**
- Consumes: `live_transcription_service.open_connection`/`DeepgramLiveConnection` (Task 1). `meeting_tasks.process_live_meeting_task` (Task 3). `storage.save_live_segments` (Task 3).
- Produces: `WS /live-meeting/{room_name}/session`. Module-level `_sessions`, `_verify_token(token, room_name) -> tuple[str, str]`, `LiveMeetingSession` dataclass — all consumed by Task 5 (same file) and tests.

This task builds presence/lifecycle only — no `captions_on` handling, no Deepgram, no contradiction checks yet (Task 5). A session WS that connects, authenticates, tracks presence, and finalizes-as-a-no-op when nothing was captured is fully testable on its own, and this is deliberately the first slice built and hardened, since two rounds of design review found real bugs specifically in this lifecycle logic.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_live_meeting.py`:

```python
import asyncio
import json

from fastapi.testclient import TestClient
from livekit import api as livekit_api

from app.core.config import get_settings
from app.main import app

settings = get_settings()
client = TestClient(app, base_url="http://localhost")


def _token_for(room: str, identity: str = "alex-mercer-1") -> str:
    return (
        livekit_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name("Alex Mercer")
        .with_grants(livekit_api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True, can_publish_data=True))
        .to_jwt()
    )


def test_session_ws_rejects_non_auth_first_message():
    with client.websocket_connect("/live-meeting/team-sync/session") as ws:
        ws.send_json({"type": "captions_on"})
        try:
            ws.receive_text()
            assert False, "expected the connection to be closed"
        except Exception:
            pass


def test_session_ws_rejects_invalid_token():
    with client.websocket_connect("/live-meeting/team-sync/session") as ws:
        ws.send_json({"type": "auth", "token": "not-a-real-token"})
        try:
            ws.receive_text()
            assert False, "expected the connection to be closed"
        except Exception:
            pass


def test_session_ws_rejects_token_for_a_different_room():
    token = _token_for(room="other-room")
    with client.websocket_connect("/live-meeting/team-sync/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        try:
            ws.receive_text()
            assert False, "expected the connection to be closed"
        except Exception:
            pass


def test_session_ws_accepts_valid_token_with_no_deepgram_key(monkeypatch):
    """The review's top finding: presence must work with zero Deepgram key
    configured — only captions_on may depend on it."""
    monkeypatch.setattr(settings, "deepgram_api_key", "")
    token = _token_for(room="team-sync", identity="presence-check-1")

    with client.websocket_connect("/live-meeting/team-sync/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        # Connection stays open — no close, no error. Send captions_on to
        # confirm *that* is what gets rejected, not the connection itself.
        ws.send_json({"type": "captions_on"})
        response = ws.receive_json()
        assert response["type"] == "captions_error"


def test_finalize_is_a_noop_with_no_segments(monkeypatch):
    from app.api import live_meeting

    monkeypatch.setattr(live_meeting, "_FINALIZE_GRACE_SECONDS", 0)
    dispatched = []
    monkeypatch.setattr(live_meeting, "process_live_meeting_task", type("T", (), {"delay": staticmethod(lambda mid: dispatched.append(mid))}))

    token = _token_for(room="empty-room-test", identity="solo-participant")
    with client.websocket_connect("/live-meeting/empty-room-test/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        # No ack is sent on successful auth (see Step 4 below) — the socket
        # goes straight into its receive loop, so there is nothing to read
        # here. Immediately exiting the `with` block below closes the
        # connection, which is exactly the disconnect path this test
        # exercises.

    async def wait_for_finalize():
        for _ in range(20):
            if "empty-room-test" not in live_meeting._sessions:
                return
            await asyncio.sleep(0.05)

    asyncio.run(wait_for_finalize())
    assert "empty-room-test" not in live_meeting._sessions
    assert dispatched == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_live_meeting.py -v`
Expected: FAIL (`app.api.live_meeting` doesn't exist; router not registered; `/live-meeting/...` 404s).

- [ ] **Step 3: Register the router**

In `backend/app/api/__init__.py`, add the import after line 6 (`from app.api.livekit import router as livekit_router`):

```python
from app.api.live_meeting import router as live_meeting_router
```

And add the include after line 12 (`api_router.include_router(livekit_router)`):

```python
api_router.include_router(live_meeting_router)
```

- [ ] **Step 4: Implement `live_meeting.py` (lifecycle only)**

Create `backend/app/api/live_meeting.py`:

```python
"""Live meeting session: room presence (auto, on joining the room) and
opt-in caption capture (this file's captions_on/off — added in the next
task) are deliberately decoupled. See "Session lifecycle" in
docs/superpowers/specs/2026-08-15-live-transcript-suggestions-design.md —
that split is what fixes the bug an earlier draft had, where toggling
captions off mid-call (or never toggling them on at all) could finalize the
meeting early or never create one at all.
"""
import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.logger import get_logger
from app.database.session import SessionLocal
from app.models.meeting import Meeting
from app.services.storage_service import StorageService
from app.tasks.meeting_tasks import process_live_meeting_task

try:
    from livekit import api as livekit_api
except ImportError:  # Keeps the rest of the API available until installed.
    livekit_api = None

logger = get_logger(__name__)
settings = get_settings()
storage = StorageService()

router = APIRouter(prefix="/live-meeting", tags=["live-meeting"])

_SAFE_ROOM = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")
_FINALIZE_GRACE_SECONDS = 45


@dataclass
class LiveMeetingSession:
    room_name: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    segments: list[dict] = field(default_factory=list)
    active_connections: int = 0
    last_contradiction_check: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    finalize_task: "asyncio.Task | None" = None


_sessions: dict[str, LiveMeetingSession] = {}
_sessions_lock = asyncio.Lock()


async def _get_or_create_session(room_name: str) -> LiveMeetingSession:
    async with _sessions_lock:
        session = _sessions.get(room_name)
        if session is None:
            session = LiveMeetingSession(room_name=room_name)
            _sessions[room_name] = session
        return session


def _verify_token(token: str, room_name: str) -> tuple[str, str]:
    """Returns (identity, display_name). Raises ValueError on any failure —
    missing verifier, bad/expired signature, or a token valid for some
    *other* room."""
    if livekit_api is None:
        raise ValueError("LiveKit support is not installed on the API server")
    try:
        verifier = livekit_api.TokenVerifier(settings.livekit_api_key, settings.livekit_api_secret)
        claims = verifier.verify(token)
    except Exception as exc:
        raise ValueError(f"Invalid or expired token: {exc}") from exc
    if not claims.video or claims.video.room != room_name:
        raise ValueError("Token is not valid for this room")
    return claims.identity, claims.name or claims.identity


def _create_meeting_from_session(room_name: str, started_at: datetime, segments: list[dict]) -> str:
    """Finalization metadata: no new Meeting columns needed — reuses the
    existing nullable date/duration fields, and generates a distinguishing
    title so repeated calls in the same default 'team-sync' room don't all
    look identical in Meeting Intelligence."""
    ended_at = datetime.now(timezone.utc)
    elapsed = max(0, int((ended_at - started_at).total_seconds()))
    h, m, s = elapsed // 3600, (elapsed % 3600) // 60, elapsed % 60
    duration = f"{h:02d}:{m:02d}:{s:02d}"
    title = f"Live: {room_name} — {started_at.strftime('%Y-%m-%d %H:%M')}"

    db = SessionLocal()
    try:
        meeting = Meeting(
            title=title,
            date=started_at.strftime("%Y-%m-%d %H:%M"),
            duration=duration,
            file_path=None,
            status="pending",
        )
        db.add(meeting)
        db.commit()
        db.refresh(meeting)
        meeting_id = meeting.id
    finally:
        db.close()

    storage.save_live_segments(meeting_id, segments)
    return meeting_id


async def _finalize_after_grace_period(session: LiveMeetingSession) -> None:
    try:
        await asyncio.sleep(_FINALIZE_GRACE_SECONDS)
    except asyncio.CancelledError:
        return

    async with session.lock:
        if session.active_connections > 0:
            return
        segments = list(session.segments)
        started_at = session.started_at

    async with _sessions_lock:
        _sessions.pop(session.room_name, None)

    if not segments:
        return

    meeting_id = _create_meeting_from_session(session.room_name, started_at, segments)
    process_live_meeting_task.delay(meeting_id)
    logger.info(f"Live meeting in room '{session.room_name}' finalized as {meeting_id} ({len(segments)} segments)")


@router.websocket("/{room_name}/session")
async def live_meeting_session(websocket: WebSocket, room_name: str) -> None:
    if not _SAFE_ROOM.fullmatch(room_name):
        await websocket.close(code=4004, reason="Invalid room name")
        return

    await websocket.accept()

    try:
        first_message = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4001, reason="Expected an auth message")
        return

    if first_message.get("type") != "auth" or not isinstance(first_message.get("token"), str):
        await websocket.close(code=4001, reason="First message must be {type: auth, token: ...}")
        return

    try:
        identity, display_name = _verify_token(first_message["token"], room_name)
    except ValueError as exc:
        await websocket.close(code=4001, reason=str(exc)[:120])
        return

    session = await _get_or_create_session(room_name)
    async with session.lock:
        session.active_connections += 1
        if session.finalize_task is not None:
            session.finalize_task.cancel()
            session.finalize_task = None

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            # captions_on/off + audio handling lands in the next task —
            # for now, anything text-typed with an unrecognized type, and
            # any binary frame, is simply ignored (no captions capability
            # exists yet on this branch of work).
    except WebSocketDisconnect:
        pass
    finally:
        async with session.lock:
            session.active_connections -= 1
            if session.active_connections <= 0:
                session.finalize_task = asyncio.create_task(_finalize_after_grace_period(session))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_live_meeting.py -v`
Expected: `5 passed`. (This may take a few seconds — the no-op finalize test waits out a real, monkeypatched-to-0 grace period.)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest -v`
Expected: all pass (30 before this task + 5 new = 35).

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/live_meeting.py backend/app/api/__init__.py backend/tests/test_live_meeting.py
git commit -m "feat(backend): add live meeting session WebSocket with token-verified presence tracking"
```

---

### Task 5: Captions, Deepgram wiring, live contradiction suggestions, transcript-so-far

**Files:**
- Modify: `backend/app/api/live_meeting.py` (extend — the `while True` loop body and imports)
- Test: extend `backend/tests/test_live_meeting.py`

**Interfaces:**
- Consumes: `live_transcription_service.open_connection`/`DeepgramLiveConnection` (Task 1), `contradiction_service.check_text` (Task 2).
- Produces: `_looks_decision_like(text: str) -> bool`. `GET /live-meeting/{room_name}/transcript-so-far`. WS messages: `{"type": "caption", ...}`, `{"type": "contradiction_suggestion", ...}`, `{"type": "captions_error", "message": str}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_live_meeting.py`:

```python
from app.api import live_meeting


def test_looks_decision_like_matches_expected_phrases():
    assert live_meeting._looks_decision_like("Let's go with vendor A") is True
    assert live_meeting._looks_decision_like("We've decided to proceed") is True
    assert live_meeting._looks_decision_like("what time is the next meeting") is False
    assert live_meeting._looks_decision_like("") is False


def test_captions_on_streams_captions_and_triggers_a_suggestion(monkeypatch):
    """The fake connection's queue is pre-populated *before* the server-side
    task ever awaits it, deliberately — TestClient runs the ASGI app in a
    different thread/event loop than this test function, and pushing an
    item into an asyncio.Queue from across threads after something is
    already blocked on .get() is not safe (the waiter's wakeup is bound to
    the other loop). Pre-populating avoids a waiter ever being created:
    Queue.get() returns immediately when the queue is already non-empty."""

    class FakeDeepgramConnection:
        def __init__(self, transcript: str):
            self.results: asyncio.Queue = asyncio.Queue()
            self.results.put_nowait(transcript)
            self.sent = []

        async def send_audio(self, chunk):
            self.sent.append(chunk)

        async def close(self):
            pass

    fake_conn = FakeDeepgramConnection("Let's go with the budget increase")

    async def fake_open_connection():
        return fake_conn

    monkeypatch.setattr(live_meeting.live_transcription_service, "open_connection", fake_open_connection)
    monkeypatch.setattr(settings, "deepgram_api_key", "fake-key-for-test")

    from app.schemas.meeting_intelligence import Flag, FlagType

    monkeypatch.setattr(
        live_meeting.contradiction_service,
        "check_text",
        lambda text, exclude_meeting_id: Flag(type=FlagType.contradiction, message="conflicts with a prior decision", judge="llm"),
    )
    monkeypatch.setattr(live_meeting, "_CONTRADICTION_COOLDOWN_SECONDS", 0)

    token = _token_for(room="captions-room-1", identity="speaker-1")
    with client.websocket_connect("/live-meeting/captions-room-1/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.send_json({"type": "captions_on"})

        caption_message = ws.receive_json()
        assert caption_message["type"] == "caption"
        assert caption_message["text"] == "Let's go with the budget increase"
        assert caption_message["speaker"] == "Alex Mercer"

        suggestion_message = ws.receive_json()
        assert suggestion_message["type"] == "contradiction_suggestion"
        assert suggestion_message["judge"] == "llm"


def test_captions_on_rejected_without_deepgram_key(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "")
    token = _token_for(room="no-deepgram-room", identity="speaker-2")
    with client.websocket_connect("/live-meeting/no-deepgram-room/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.send_json({"type": "captions_on"})
        response = ws.receive_json()
        assert response["type"] == "captions_error"


def test_captions_on_failure_sends_error_without_closing_session(monkeypatch):
    """A Deepgram connection failure must degrade to captions_error, not
    crash the session WS — presence stays up regardless of Deepgram's
    availability."""
    async def failing_open_connection():
        raise ConnectionError("simulated Deepgram outage")

    monkeypatch.setattr(live_meeting.live_transcription_service, "open_connection", failing_open_connection)
    monkeypatch.setattr(settings, "deepgram_api_key", "fake-key-for-test")

    token = _token_for(room="deepgram-down-room", identity="speaker-3")
    with client.websocket_connect("/live-meeting/deepgram-down-room/session") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.send_json({"type": "captions_on"})
        response = ws.receive_json()
        assert response["type"] == "captions_error"

        # The session WS itself is still alive — a second captions_on retry
        # is processed (and fails the same way) instead of the socket
        # having been torn down.
        ws.send_json({"type": "captions_on"})
        second_response = ws.receive_json()
        assert second_response["type"] == "captions_error"


def test_transcript_so_far_requires_a_valid_token_for_the_room():
    response = client.get("/live-meeting/some-room/transcript-so-far")
    assert response.status_code == 401

    wrong_room_token = _token_for(room="other-room")
    response = client.get("/live-meeting/some-room/transcript-so-far", headers={"Authorization": f"Bearer {wrong_room_token}"})
    assert response.status_code == 403


def test_transcript_so_far_returns_empty_list_for_unknown_room():
    token = _token_for(room="never-used-room")
    response = client.get("/live-meeting/never-used-room/transcript-so-far", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"segments": []}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_live_meeting.py -v`
Expected: FAIL — `_looks_decision_like` doesn't exist, `captions_on` is currently a no-op, `/transcript-so-far` 404s.

- [ ] **Step 3: Extend `live_meeting.py`**

Add these imports near the top of `backend/app/api/live_meeting.py` (alongside the existing ones):

```python
import json

from fastapi import Header, HTTPException
from pydantic import BaseModel

from app.graph import contradiction_service
from app.services import live_transcription_service
```

Add these module-level constants after `_FINALIZE_GRACE_SECONDS = 45`:

```python
_CONTRADICTION_COOLDOWN_SECONDS = 15

# Same house style as app.services.askcoco_service._SUMMARY_KEYWORDS —
# phrase matching, not full NLP. A cheap pre-filter so contradiction checks
# (an embedding search + a judge call) only run on text that plausibly
# states a decision, not every sentence spoken in the room.
_DECISION_KEYWORDS = (
    "let's go with", "lets go with", "we'll", "we will", "decided", "decide",
    "agreed", "final", "approved", "approve", "moving forward with",
    "let's do", "lets do",
)


def _looks_decision_like(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in _DECISION_KEYWORDS)


class TranscriptSoFarResponse(BaseModel):
    segments: list[dict]
```

Add the `_forward_deepgram_results` function after `_create_meeting_from_session`:

```python
async def _forward_deepgram_results(
    connection: "live_transcription_service.DeepgramLiveConnection",
    websocket: WebSocket,
    session: LiveMeetingSession,
    identity: str,
    display_name: str,
) -> None:
    while True:
        text = await connection.results.get()
        segment = {
            "speaker": display_name,
            "identity": identity,
            "text": text,
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
            "start": (datetime.now(timezone.utc) - session.started_at).total_seconds(),
        }
        async with session.lock:
            session.segments.append(segment)
        await websocket.send_json({"type": "caption", **segment})

        if _looks_decision_like(text):
            now = time.monotonic()
            should_check = False
            async with session.lock:
                if now - session.last_contradiction_check > _CONTRADICTION_COOLDOWN_SECONDS:
                    session.last_contradiction_check = now
                    should_check = True
            if should_check:
                flag = await asyncio.to_thread(contradiction_service.check_text, text, exclude_meeting_id=session.id)
                if flag is not None:
                    await websocket.send_json({"type": "contradiction_suggestion", **flag.model_dump()})
```

Replace the `while True:` loop body inside `live_meeting_session` (the comment placeholder from Task 4) with:

```python
    deepgram = None
    forward_task = None

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            if message.get("text") is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                msg_type = payload.get("type")

                if msg_type == "captions_on":
                    if not settings.deepgram_api_key:
                        await websocket.send_json({"type": "captions_error", "message": "Live captions are not configured on this server."})
                        continue
                    if deepgram is None:
                        try:
                            deepgram = await live_transcription_service.open_connection()
                        except Exception as exc:
                            logger.warning(f"Failed to open Deepgram connection: {exc}")
                            await websocket.send_json({"type": "captions_error", "message": "Could not start live captions right now."})
                            continue
                        forward_task = asyncio.create_task(
                            _forward_deepgram_results(deepgram, websocket, session, identity, display_name)
                        )

                elif msg_type == "captions_off":
                    if deepgram is not None:
                        if forward_task is not None:
                            forward_task.cancel()
                            forward_task = None
                        await deepgram.close()
                        deepgram = None

            elif message.get("bytes") is not None and deepgram is not None:
                try:
                    await deepgram.send_audio(message["bytes"])
                except Exception as exc:
                    # A mid-call Deepgram drop must not crash the session WS
                    # (presence stays up) — degrade to captions_error instead.
                    logger.warning(f"Deepgram send failed, closing captions: {exc}")
                    await websocket.send_json({"type": "captions_error", "message": "Live captions disconnected."})
                    if forward_task is not None:
                        forward_task.cancel()
                        forward_task = None
                    deepgram = None
    except WebSocketDisconnect:
        pass
    finally:
        if forward_task is not None:
            forward_task.cancel()
        if deepgram is not None:
            await deepgram.close()
        async with session.lock:
            session.active_connections -= 1
            if session.active_connections <= 0:
                session.finalize_task = asyncio.create_task(_finalize_after_grace_period(session))
```

(This replaces both the `while True` loop *and* the `finally` block Task 4 wrote — the decrement/finalize-scheduling logic is now here since it has to run after Deepgram/forward_task cleanup, not before.)

Add the `transcript-so-far` endpoint at the end of the file:

```python
@router.get("/{room_name}/transcript-so-far", response_model=TranscriptSoFarResponse)
def get_transcript_so_far(room_name: str, authorization: str = Header(default="")) -> TranscriptSoFarResponse:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        _verify_token(token, room_name)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    session = _sessions.get(room_name)
    return TranscriptSoFarResponse(segments=list(session.segments) if session else [])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_live_meeting.py -v`
Expected: all pass (5 from Task 4 + 6 new = 11).

- [ ] **Step 5: Run the full suite**

Run: `cd backend && ./.venv/Scripts/python.exe -m pytest -v`
Expected: all pass (35 before this task + 6 new = 41).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/live_meeting.py backend/tests/test_live_meeting.py
git commit -m "feat(backend): wire captions, Deepgram, and live contradiction suggestions into the session WebSocket"
```

---

### Task 6: `useLiveMeetingSession` frontend hook

**Files:**
- Create: `frontend/src/hooks/useLiveMeetingSession.ts`

**Interfaces:**
- Consumes: `useLocalParticipant`, `useTracks`, `useRoomContext` from `@livekit/components-react` (existing). `Track` from `livekit-client` (existing).
- Produces: `useLiveMeetingSession(roomName: string, token: string): LiveMeetingSessionState` — see the exported type below. Consumed by Task 7 (`LiveTranscriptPanel.tsx`), Task 8 (`LiveSuggestionBanner.tsx`), and Task 9 (the toggle button in `MeetingRoomView.tsx`).

No automated test for this task — the project has no frontend test runner configured (`frontend/package.json` has no `test` script, no test files exist outside `node_modules`), and the spec's own Testing section is explicit that this WebSocket+MediaRecorder path is verified manually in-browser, not mocked. This task's steps are implementation steps; Task 10 is the verification gate.

- [ ] **Step 1: Determine the backend WS/HTTP base URL**

`MeetingRoomView.tsx` already computes its own `apiBaseUrl` for the `/livekit/token` fetch (lines 34-35) rather than using `frontend/src/services/api.ts`'s separately-named `API_BASE` — follow that existing local pattern, not `api.ts`'s, since the session WS needs the exact same LAN-aware host derivation the token endpoint already has, just with a `ws`/`wss` scheme instead of `http`/`https`.

- [ ] **Step 2: Implement the hook**

Create `frontend/src/hooks/useLiveMeetingSession.ts`:

```typescript
import { useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CaptionLine = { id: string; speaker: string; text: string; timestamp: string };
export type LiveSuggestion = {
  id: string;
  message: string;
  severity: string;
  judge: 'llm' | 'keyword_fallback';
  contradictsMeetingId?: string;
  contradictsDecisionText?: string;
};

export type LiveMeetingSessionState = {
  connectionError: string;
  captionsEnabled: boolean;
  captionsError: string;
  toggleCaptions: () => void;
  transcript: CaptionLine[];
  suggestions: LiveSuggestion[];
  dismissSuggestion: (id: string) => void;
};

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)
  ?? `${window.location.protocol}//${window.location.hostname}:8000`;
const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const preferredMimeType = () => [
  'audio/webm;codecs=opus',
  'audio/webm',
].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';

let localIdCounter = 0;
const nextLocalId = () => `local-${Date.now()}-${localIdCounter++}`;

export function useLiveMeetingSession(roomName: string, token: string): LiveMeetingSessionState {
  const room = useRoomContext();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const microphones = useTracks([Track.Source.Microphone], { onlySubscribed: true });

  const [connectionError, setConnectionError] = useState('');
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionsError, setCaptionsError] = useState('');
  const [transcript, setTranscript] = useState<CaptionLine[]>([]);
  const [suggestions, setSuggestions] = useState<LiveSuggestion[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const publish = useCallback((topic: 'live-transcript' | 'live-suggestion', payload: unknown) => {
    void room.localParticipant.publishData(encoder.encode(JSON.stringify(payload)), { reliable: true, topic });
  }, [room]);

  // Session WS: opens once on room join, independent of the caption toggle.
  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${wsBaseUrl}/live-meeting/${roomName}/session`);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === 'caption') {
        const line: CaptionLine = { id: nextLocalId(), speaker: payload.speaker, text: payload.text, timestamp: payload.timestamp };
        setTranscript((prev) => [...prev, line]);
        publish('live-transcript', line);
      } else if (payload.type === 'contradiction_suggestion') {
        const suggestion: LiveSuggestion = {
          id: nextLocalId(),
          message: payload.message,
          severity: payload.severity,
          judge: payload.judge,
          contradictsMeetingId: payload.contradicts_meeting_id,
          contradictsDecisionText: payload.contradicts_decision_text,
        };
        setSuggestions((prev) => [...prev, suggestion]);
        publish('live-suggestion', suggestion);
      } else if (payload.type === 'captions_error') {
        setCaptionsError(payload.message);
        setCaptionsEnabled(false);
      }
    };

    ws.onerror = () => setConnectionError('Could not reach the live meeting service.');
    ws.onclose = (event) => {
      if (event.code >= 4000) setConnectionError(event.reason || 'The live meeting connection was closed.');
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, token]);

  // History hydration for a late joiner — the LiveKit data channel has no
  // replay of its own, so this is a one-time backend read on mount.
  useEffect(() => {
    if (!token) return;
    fetch(`${apiBaseUrl}/live-meeting/${roomName}/transcript-so-far`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { segments: [] }))
      .then((data: { segments: Array<{ speaker: string; text: string; timestamp: string }> }) => {
        setTranscript((prev) => [
          ...data.segments.map((s) => ({ id: nextLocalId(), speaker: s.speaker, text: s.text, timestamp: s.timestamp })),
          ...prev,
        ]);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, token]);

  // Receiving other participants' captions/suggestions via the same
  // LiveKit data-channel pattern CollaborativeWhiteboard.tsx already uses.
  useEffect(() => {
    const handleMessage = (data: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== 'live-transcript' && topic !== 'live-suggestion') return;
      const payload = JSON.parse(decoder.decode(data));
      if (topic === 'live-transcript') {
        setTranscript((prev) => (prev.some((line) => line.id === payload.id) ? prev : [...prev, payload]));
      } else {
        setSuggestions((prev) => (prev.some((s) => s.id === payload.id) ? prev : [...prev, payload]));
      }
    };
    room.on(RoomEvent.DataReceived, handleMessage);
    return () => { room.off(RoomEvent.DataReceived, handleMessage); };
  }, [room]);

  const stopCapture = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const toggleCaptions = useCallback(() => {
    setCaptionsEnabled((enabled) => {
      const next = !enabled;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return enabled;

      if (next) {
        setCaptionsError('');
        ws.send(JSON.stringify({ type: 'captions_on' }));
      } else {
        ws.send(JSON.stringify({ type: 'captions_off' }));
        stopCapture();
      }
      return next;
    });
  }, [stopCapture]);

  // Must respect LiveKit mute state: stop sending audio (and flip captions
  // off) the moment the mic is muted, not just stop what other
  // participants hear.
  useEffect(() => {
    if (!captionsEnabled) return;
    if (!isMicrophoneEnabled) {
      toggleCaptions();
      return;
    }

    const track = microphones[0]?.publication.track?.mediaStreamTrack;
    const ws = wsRef.current;
    if (!track || !ws) return;

    const mimeType = preferredMimeType();
    const recorder = new MediaRecorder(new MediaStream([track]), mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) void event.data.arrayBuffer().then((buf) => ws.send(buf));
    };
    recorder.start(250);
    recorderRef.current = recorder;

    return () => recorder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionsEnabled, isMicrophoneEnabled, microphones]);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { connectionError, captionsEnabled, captionsError, toggleCaptions, transcript, suggestions, dismissSuggestion };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useLiveMeetingSession.ts
git commit -m "feat(frontend): add useLiveMeetingSession hook for live captions and suggestions"
```

---

### Task 7: `LiveTranscriptPanel.tsx`

**Files:**
- Create: `frontend/src/components/LiveTranscriptPanel.tsx`

**Interfaces:**
- Consumes: `CaptionLine[]` from Task 6's hook (passed as a prop — the hook is called once in `MeetingRoomView.tsx`, Task 9).

- [ ] **Step 1: Implement the component**

Create `frontend/src/components/LiveTranscriptPanel.tsx`:

```tsx
import { Captions } from 'lucide-react';
import React from 'react';
import type { CaptionLine } from '../hooks/useLiveMeetingSession';

export const LiveTranscriptPanel: React.FC<{ transcript: CaptionLine[]; error: string }> = ({ transcript, error }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
      <Captions className="h-4 w-4 text-indigo-600" /> Live transcript
    </div>

    {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}

    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
      {transcript.length === 0 && !error && (
        <p className="text-xs text-slate-400">Captions will appear here once someone turns on Live Transcript.</p>
      )}
      {transcript.map((line) => (
        <div key={line.id} className="text-xs text-slate-700">
          <span className="font-bold text-indigo-700">{line.speaker}</span>
          <span className="ml-1.5 text-slate-400">{line.timestamp}</span>
          <p className="mt-0.5">{line.text}</p>
        </div>
      ))}
    </div>
  </section>
);
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LiveTranscriptPanel.tsx
git commit -m "feat(frontend): add LiveTranscriptPanel caption feed"
```

---

### Task 8: `LiveSuggestionBanner.tsx`

**Files:**
- Create: `frontend/src/components/LiveSuggestionBanner.tsx`

**Interfaces:**
- Consumes: `LiveSuggestion[]` from Task 6's hook (passed as a prop).

- [ ] **Step 1: Implement the component**

Create `frontend/src/components/LiveSuggestionBanner.tsx`:

```tsx
import { ShieldAlert, X } from 'lucide-react';
import React from 'react';
import type { LiveSuggestion } from '../hooks/useLiveMeetingSession';

export const LiveSuggestionBanner: React.FC<{ suggestions: LiveSuggestion[]; onDismiss: (id: string) => void }> = ({ suggestions, onDismiss }) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold">Coco noticed a possible contradiction</span>
              {suggestion.judge === 'keyword_fallback' && (
                <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                  Pattern-matched — not AI-verified
                </span>
              )}
            </div>
            <p className="mt-1">{suggestion.message}</p>
            {suggestion.contradictsDecisionText && (
              <p className="mt-1 text-xs text-rose-600">Conflicts with: "{suggestion.contradictsDecisionText}"</p>
            )}
          </div>
          <button onClick={() => onDismiss(suggestion.id)} className="text-rose-400 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LiveSuggestionBanner.tsx
git commit -m "feat(frontend): add LiveSuggestionBanner for live contradiction flags"
```

---

### Task 9: Wire into `MeetingRoomView.tsx`

**Files:**
- Modify: `frontend/src/components/MeetingRoomView.tsx`

**Interfaces:**
- Consumes: `useLiveMeetingSession` (Task 6), `LiveTranscriptPanel` (Task 7), `LiveSuggestionBanner` (Task 8).

- [ ] **Step 1: Thread the LiveKit token down to `RoomContent`**

In `frontend/src/components/MeetingRoomView.tsx`, the `RoomContent` component currently receives `roomName`/`displayName`/`onLeave` but not the raw LiveKit `token` — the session WS auth handshake needs it. Update the type at line 149:

```tsx
const RoomContent: React.FC<{ roomName: string; displayName: string; token: string; onLeave: () => void }> = ({ roomName, displayName, token, onLeave }) => {
```

And the render call at line 254 — add `token={joinDetails.token}`:

```tsx
    return <LiveKitRoom token={joinDetails.token} serverUrl={joinDetails.serverUrl} connect audio video onError={(roomError) => setError(roomError.message)}><RoomAudioRenderer /><RoomContent roomName={joinDetails.roomName} displayName={joinDetails.displayName} token={joinDetails.token} onLeave={() => { setJoinDetails(null); setError(''); }} /></LiveKitRoom>;
```

- [ ] **Step 2: Add the imports**

Add near the top of the file, alongside the other component imports (after `import { MeetingRecorder } from './MeetingRecorder';`):

```tsx
import { useLiveMeetingSession } from '../hooks/useLiveMeetingSession';
import { LiveSuggestionBanner } from './LiveSuggestionBanner';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';
```

Add `Captions` to the existing `lucide-react` import list (alongside `Camera, CameraOff, AlertCircle, ...`).

- [ ] **Step 3: Call the hook once in `RoomContent` and add the toggle state**

Inside `RoomContent`, alongside the existing `const [showCoco, setShowCoco] = useState(false);` line, add:

```tsx
  const [showTranscript, setShowTranscript] = useState(false);
  const liveSession = useLiveMeetingSession(roomName, token);
```

- [ ] **Step 4: Mount the transcript panel and suggestion banner**

Add the suggestion banner right after the `{mediaError && ...}` block (so it sits at the top, above every other panel):

```tsx
      <LiveSuggestionBanner suggestions={liveSession.suggestions} onDismiss={liveSession.dismissSuggestion} />
```

Add the transcript panel in the same conditional-render position as `{showCoco && <CocoPanel />}` (right after it):

```tsx
          {showTranscript && <LiveTranscriptPanel transcript={liveSession.transcript} error={liveSession.captionsError || liveSession.connectionError} />}
```

- [ ] **Step 5: Add the toggle button**

In the bottom toolbar, add a new button between the "Coco" toggle and the "Share" toggle:

```tsx
        <button
          onClick={() => { setShowTranscript((v) => !v); liveSession.toggleCaptions(); }}
          className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            liveSession.captionsEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Captions className="h-5 w-5" /><span>Transcript</span>
        </button>
```

- [ ] **Step 6: Type-check and build**

Run: `cd frontend && npm run build`
Expected: builds with no TypeScript errors. Fix any prop/import mismatches this surfaces before moving on.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/MeetingRoomView.tsx
git commit -m "feat(frontend): wire live transcript and suggestions into the Live Meeting Room"
```

---

### Task 10: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start every service**

Follow `docs/LIVEKIT_MEETING.md`'s local development steps: `livekit-server --dev`, `cd backend && uvicorn app.main:app --reload`, `cd frontend && npm run dev`. Also start Redis and a Celery worker (`celery -A app.core.celery_app worker`) — finalization needs both to actually process.

- [ ] **Step 2: Two-browser caption + suggestion flow**

Open the app in two separate browser profiles, both join room `team-sync` in Live Meeting. In profile A, click **Transcript**. Speak a sentence. Confirm:
- Profile A sees its own caption appear immediately.
- Profile B sees the same caption appear (via the LiveKit data channel).

- [ ] **Step 3: Mute stops capture**

In profile A, mute the mic via the **Mic** toggle. Confirm the Transcript toggle turns off and no further captions appear from profile A while muted, even if you keep talking.

- [ ] **Step 4: Contradiction suggestion appears and is labeled correctly**

With `DEMO_MODE=true` and no `GEMINI_API_KEY`/`AGNES_API_KEY` set (the keyless-demo configuration the whole Task 2 fallback exists for), say a decision-sounding sentence that opposes a seeded demo decision (e.g. reference approving a vendor budget increase, which should oppose the seeded freeze/halt decision from `graph_builder.seed_demo_history()`). Confirm:
- A rose-colored suggestion banner appears in both profiles.
- It shows the "Pattern-matched — not AI-verified" badge (since no LLM key is configured).

- [ ] **Step 5: Late joiner gets history**

Open a third browser profile and join the same room after captions have already been flowing. Confirm the transcript panel shows the prior lines immediately on opening, not just new ones going forward.

- [ ] **Step 6: Finalized call enters Meeting Intelligence**

Have all participants leave the room (close the tab, not just close the panel). Wait slightly over 45 seconds. Confirm:
- The Celery worker's log shows `process_live_meeting_task` running.
- The call now appears in the Meeting Intelligence list with a title like `Live: team-sync — 2026-08-15 HH:MM` (not the bare `team-sync`), and opening it shows the real captured transcript, a summary, and decisions.

- [ ] **Step 7: A call nobody captioned stays ephemeral**

Join a fresh room, don't touch the Transcript toggle at all, leave. Confirm no new Meeting appears — decision 3b's opt-in scoping is intact.

If any step fails, treat it the same as a failing automated test: fix the root cause in the relevant task's files, re-run the affected backend tests if applicable, then re-verify this step before continuing.
