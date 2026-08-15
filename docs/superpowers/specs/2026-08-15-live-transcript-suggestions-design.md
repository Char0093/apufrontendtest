# Live transcript streaming + proactive suggestions — design

**Status:** Approved, pending implementation plan
**Date:** 2026-08-15
**Scope:** `frontend/src/components/MeetingRoomView.tsx` and a new slice of `backend/app/`

## Problem

Live Meeting Rooms (LiveKit-based video/audio/screen-share/whiteboard, shipped
in commits around "LiveKit connectivity" / "embed Ask Coco chat into Live
Meeting rooms") currently produce **zero backend record**. `POST
/livekit/token` only signs a JWT; nothing said in a live call is transcribed,
stored, or fed into the knowledge graph. This is a real product gap: an
uploaded recording gets the full Gemini-extraction → decisions/action
items/contradiction-graph treatment, but a live call — arguably the more
natural way a meeting actually happens — gets none of it.

This spec adds two things to the live room:

1. **Live transcript streaming** — a shared, speaker-labeled caption feed
   visible to every participant while the call is happening.
2. **Proactive suggestions** — Coco surfaces a contradiction warning
   *during* the call when something being said conflicts with a past
   decision already in the graph, instead of only catching it in an
   after-the-fact report.

## Decisions made (user-confirmed)

These three questions were the real scope forks; all three were resolved in
favor of the recommended option during brainstorming:

1. **Post-call persistence:** when a live call ends, it becomes a real
   `Meeting` — same Gemini extraction → decisions/action items/contradiction
   pipeline as an uploaded recording. Live meetings show up in Meeting
   Intelligence, the Dashboard, and the knowledge graph exactly like
   uploads. (Rejected: ephemeral-only, or persisting the transcript without
   re-running extraction.)
2. **Suggestion scope:** contradiction flags only. Reuses the app's
   existing flagship differentiator (`contradiction_service.py`) rather than
   building a second, different kind of "related context" suggestion.
   (Rejected: also surfacing related past decisions/open action items, and a
   non-pushing "suggested questions" mode.)
3. **Transcription architecture:** each participant's browser streams its
   *own* mic audio to a new backend WebSocket, which proxies to Deepgram's
   live streaming API server-side. (Rejected: a server-side LiveKit Agents
   worker subscribing to room audio centrally — too much new long-running
   infrastructure for a hackathon timeline; and the browser-native Web
   Speech API — would feed a lower/inconsistent-quality transcript into the
   same pipeline uploads use, and doesn't reuse the Deepgram investment
   already made elsewhere in the app.)

A useful side effect of decision 3: since each caption comes from a
specific participant's own microphone, the speaker label is that
participant's real LiveKit identity — no diarization guessing required, and
actually more accurate than the post-hoc Deepgram diarization uploads go
through today.

## Architecture overview

```
 participant's browser                     FastAPI backend                    external
 ─────────────────────                     ────────────────                   ────────
 mic track (already published   audio      WS /live-meeting/{room}/  audio    Deepgram
 to LiveKit) --MediaRecorder-->  chunks --> transcribe               chunks--> live streaming
                                             (live_meeting.py)                 API
                                                    |
                                     caption line   | tags with this
                                     back over WS   | connection's identity,
                                             <-------  appends to in-memory
                                                       LiveMeetingSession
                                                    |
                                                    | keyword gate + ~15s/room
                                                    | cooldown -> passes?
                                                    v
                                          contradiction_service.check_text()
                                          (embedding_service.query_similar_decisions
                                           + Gemini judge, reused as-is)
                                                    |
                                     suggestion  <---
                                     back over WS (only to the
                                     connection that triggered it)

 receiving client republishes both captions and suggestions via
 room.localParticipant.publishData(topic: 'live-transcript' | 'live-suggestion')
 -> every other participant's browser receives them via
    room.on(RoomEvent.DataReceived, ...) — the exact pattern
    CollaborativeWhiteboard.tsx already uses.

 On last disconnect + ~45s grace period, if segments is non-empty:
   create Meeting row -> process_live_meeting_task(meeting_id, segments)
   -> _analyze_transcript() [new, shared with the upload pipeline]
   -> _save_and_graph() [existing, unchanged]
```

The backend never broadcasts to other participants itself — it only ever
talks 1:1 with the connection that sent it audio. All fan-out to the rest of
the room happens client-side over LiveKit's existing data channel, so there
is exactly one fan-out mechanism in the codebase (the whiteboard's), not two.

## Backend components

### `app/services/live_transcription_service.py` (new)

Thin proxy to Deepgram's live streaming WebSocket
(`wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&punctuate=true&language=en`)
— same `nova-2` model the existing REST path
(`asr_service.run_deepgram_transcription`) uses, for consistent transcript
quality/style between live and uploaded meetings. One Deepgram connection
per client WebSocket connection. Only forwards `is_final: true` results
upstream; interim results are used only to show a "typing"-style indicator
client-side, never appended to the durable transcript.

### `app/api/live_meeting.py` (new router)

`WS /live-meeting/{room_name}/transcribe?identity=...&display_name=...`
(query params mirror `LiveKitTokenRequest`'s fields). Per connection:

1. Accept the WS, open a Deepgram live connection via
   `live_transcription_service`, reject with a clear close reason if
   `settings.deepgram_api_key` is unset (mirrors `livekit.py`'s `503` when
   `livekit_api` isn't installed).
2. On each finalized Deepgram result: build `{speaker: display_name,
   identity, text, timestamp}`, append to that room's
   `LiveMeetingSession.segments`, send it back down this client's WS.
3. Run the keyword gate on the text; if it passes AND the room's cooldown
   has elapsed, call `contradiction_service.check_text(text,
   exclude_meeting_id=session.id)` — `session.id` is a session uuid, not a
   real `Meeting.id` (none exists yet during a live call), but it's a safe
   value to pass: nothing in the graph can reference an id that doesn't
   exist yet, so it excludes nothing and is purely there to satisfy the
   same function signature `check_decisions()` uses post-call. On a `Flag`,
   send `{type: "contradiction_suggestion", ...flag}` back down this same
   client's WS (not broadcast server-side — see architecture note above).
4. On disconnect: close the Deepgram connection, decrement
   `active_connections`; if it hits 0, schedule finalization after a ~45s
   grace period (cancelled if a new connection for the same room arrives
   first).

### In-memory session registry

`_sessions: dict[str, LiveMeetingSession]` keyed by `room_name`, module-level
in `live_meeting.py`. `LiveMeetingSession`: `id` (uuid, independent of
`room_name` so a reused room name like "team-sync" across different days
doesn't collide), `segments: list[dict]`, `active_connections: int`,
`last_contradiction_check: float`. Single-process, in-memory state — matches
the rest of this hackathon prototype's complexity level (SQLite, single
Celery worker assumed); no Redis-backed session state.

No `Meeting` DB row exists while the call is live. It's created only at
finalization, exactly like an upload's `Meeting` row is created once there's
actually a file to process — this avoids a "live" status enum value, avoids
ever having a half-live orphaned row, and means a server restart mid-call
simply loses that call's in-progress transcript rather than leaving stale
DB state (acceptable for a hackathon prototype; see Out of scope).

### Keyword gate

Module-level tuple in `live_meeting.py`, same house style as
`askcoco_service._SUMMARY_KEYWORDS` — phrases like "let's go with", "we'll",
"decided", "agreed", "final", "approved", "moving forward with". A pure
function `_looks_decision_like(text: str) -> bool`, unit-testable in
isolation.

### `app/graph/contradiction_service.py` (extended, not rewritten)

New public function, extracted from the existing per-decision loop body in
`check_decisions()`:

```python
def check_text(text: str, exclude_meeting_id: str) -> Flag | None:
    """Embed `text`, find similar past decisions from other meetings, ask
    Gemini whether they genuinely conflict. Returns a Flag on a real
    contradiction, None otherwise (including on any failure — fails closed)."""
```

`check_decisions()` becomes a thin loop calling `check_text()` per decision —
a behavior-preserving refactor. Existing tests covering contradiction
detection must still pass unchanged.

### `app/tasks/meeting_tasks.py` (extended)

- Extract the Gemini-extraction-through-contradiction tail of `_run_pipeline`
  (everything from building `transcript_text` through setting
  `intelligence.flags`) into `_analyze_transcript(meeting, segments,
  on_progress) -> MeetingIntelligence`. `_run_pipeline` becomes: extract
  audio, transcribe, then call `_analyze_transcript`. No vision/nameplate
  step for live sessions — there's no separate video file to sample frames
  from, matching how uploads already skip vision for non-`.mp4` files.
- Extract the generic retry/status-transition shell of `process_meeting_task`
  (DB status transitions, retry/backoff, error persistence — currently lines
  ~136-189) into a shared helper parameterized by which pipeline function to
  run, so the new task reuses it instead of reimplementing retry logic.
- New task: `process_live_meeting_task(meeting_id, segments)` — creates/loads
  the `Meeting` row, calls `_analyze_transcript(meeting, segments,
  on_progress)`, then the existing `_save_and_graph(meeting, intelligence)`
  unchanged.
- Finalization in `live_meeting.py` creates the `Meeting` row (`title` = room
  name, `file_path` = `None`, no new status value needed — same `pending` →
  `processing` → `completed`/`failed` lifecycle uploads already have) and
  dispatches `process_live_meeting_task.delay(meeting_id, segments)`.

## Frontend components

### `useLiveTranscription` hook (new)

Parameters: `room`, `enabled` (bound to the toggle button). When enabled:
opens the transcribe WS with this participant's `identity`/`displayName`,
captures the local mic via `MediaRecorder` on a short timeslice — same
capture technique already proven in `MeetingRecorder.tsx` — and streams
chunks up. On each caption/suggestion received back, republishes it via
`room.localParticipant.publishData(payload, {topic: 'live-transcript'})` or
`'live-suggestion'` respectively, so every participant's browser (including
this one) receives it through the same `RoomEvent.DataReceived` path.

### `LiveTranscriptPanel.tsx` (new)

New toggle button beside the existing Coco toggle in `MeetingRoomView.tsx`'s
bottom toolbar. When on: scrolling, speaker-labeled caption feed, subscribed
via `room.on(RoomEvent.DataReceived, handler)` filtering on the
`'live-transcript'` topic — the exact pattern `CollaborativeWhiteboard.tsx`
already uses (`room.on(RoomEvent.DataReceived, handleMessage)` /
`room.localParticipant.publishData(...)`), not a different API convention.

### Suggestion banner

Dismissible card in the same rose/`ShieldAlert` visual language the app
already uses for contradictions (Header notification bell's `case
'contradiction'`, Memory Graph's red-dashed `CONTRADICTS` edges). Rendered
above whatever panels (whiteboard/Coco/transcript) are currently open in
`MeetingRoomView.tsx`, subscribed to the `'live-suggestion'` data topic the
same way the transcript panel subscribes to `'live-transcript'`.

## Error handling

Transcription is strictly opt-in (toggle button) and bolt-on — nothing about
it can break the actual video call, which keeps working regardless of its
state.

- Deepgram connection fails or drops mid-call → backend closes that client's
  transcribe WS with a clear reason; frontend shows a small inline error in
  the transcript panel (mirrors the existing `mediaError` banner pattern in
  `MeetingRoomView.tsx`), the toggle resets to off.
- `DEEPGRAM_API_KEY` unset → WS connection rejected immediately on first
  attempt with a clear close reason; no separate capability-probe endpoint.
- Gemini judge call fails during a live check → identical to today's
  `_judge_contradiction`: fails closed, no suggestion shown, no crash.
- Browser lacks `MediaRecorder` or mic permission is denied → same inline
  error path the existing camera/mic toggles already use.
- Call-end processing failure → reuses the exact retry/backoff/`failed`
  status machinery `process_meeting_task` already has, via the shared shell
  extracted above.
- No segments accumulated (toggled on/off with nobody speaking) → finalize
  is a no-op; no `Meeting` row, no Celery dispatch.

## Testing

**Backend (automated):**
- `check_text()` — unit tests with synthetic decision pairs; regression-check
  that `check_decisions()`'s existing behavior/tests are unchanged after the
  extraction.
- `_looks_decision_like()` — pure function, table-driven test over
  should-trigger / shouldn't-trigger phrases.
- `_analyze_transcript()` / refactored `_run_pipeline()` — the upload path
  must produce identical output to today; run against whatever existing
  fixture `test_phase_contracts.py` already uses.

**Frontend:** no automated coverage for the WebSocket+MediaRecorder audio
path (not practical to mock meaningfully). Verified manually instead: two
browser profiles in the same live room (per the existing testing steps in
`docs/LIVEKIT_MEETING.md`), confirming captions and a triggered contradiction
suggestion both appear on both sides. This will be driven for real in the
preview browser once built, not just asserted.

## Out of scope (explicit, for hackathon focus)

- A server-side LiveKit Agents worker (centralized audio subscription) —
  deferred; the per-participant WS approach was chosen specifically to avoid
  this new class of long-running process.
- Transcript editing/correction UI.
- Non-contradiction suggestions (related past decisions, open action item
  reminders, suggested questions) — contradiction-only per the scope
  decision above.
- Session recovery across a full backend restart — in-memory state is lost
  on restart; an in-progress live call's transcript-so-far would be lost
  too. Acceptable for a hackathon prototype; would need Redis-backed session
  state to fix properly.
- LiveKit webhooks / server-side room-lifecycle integration — this feature's
  session lifecycle is entirely defined by transcribe-WS connect/disconnect,
  independent of LiveKit's own participant tracking.
- A new demo-mode path for live audio itself (DEMO_MODE's existing
  zero-external-API-calls behavior already applies for free at the
  finalization step, since that reuses `_analyze_transcript`'s existing
  DEMO_MODE branch — no separate handling needed).
