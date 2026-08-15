# Live transcript streaming + proactive suggestions — design

**Status:** Approved, revised after technical review, pending implementation plan
**Date:** 2026-08-15
**Scope:** `frontend/src/components/MeetingRoomView.tsx` and a new slice of `backend/app/`

## Revisions (2026-08-15, post-review)

A technical review of the first draft found 8 real gaps (2 High, 5 Medium, 1
Low) — all verified against the actual code before accepting. This revision
fixes 7 directly; the 8th (whether audio capture should be opt-in or
always-on) was a product/consent decision, resolved by re-confirming
**opt-in** with the user. Summary of what changed:

- **Room presence is now tracked separately from caption capture.** The
  original draft tied session finalization to the transcribe-WS connection
  count, which is also what the caption toggle controlled — so toggling
  captions off mid-call (while staying in the room) would have finalized
  the meeting early, and a call where nobody ever toggled captions on would
  never become a `Meeting` at all, undermining the persistence decision.
  Fixed by splitting "is this participant still in the room" (drives
  session lifecycle, connects automatically) from "is this participant
  broadcasting captions right now" (opt-in, gates only whether audio is
  sent) — see **Session lifecycle** below.
- **Speaker identity is now verified, not client-asserted.** The original
  draft took `identity`/`display_name` as raw WebSocket query params —
  spoofable by any client, which matters because this transcript becomes
  durable knowledge-graph input attributed to specific people. Fixed by
  verifying the participant's actual LiveKit access token server-side.
- **Live suggestions now have a demo-safe path.** The original draft's
  contradiction judge call hits Gemini/Agnes unconditionally and fails
  closed with no key configured — meaning the flagship live-suggestion
  moment would silently never fire in a keyless demo, contradicting this
  project's own demo-reliability-first precedent (`DEMO_MODE`). Fixed with
  a deterministic keyword-based fallback judge — see **Demo-safe
  contradiction judging** below.
- Mic capture now explicitly must respect LiveKit mute state, captions/
  suggestions now render locally immediately (not only via the LiveKit
  round-trip), late joiners now hydrate transcript history from the
  backend, the Celery task now takes a `meeting_id` (not a full transcript
  payload), `websockets` is now an explicit dependency with Deepgram
  KeepAlive handling, and audio format (WebM/Opus, no `encoding`/
  `sample_rate` params) is now stated explicitly rather than left implicit.

### Round 2 (same day, second review pass)

A second review of this document found one internal contradiction this
revision had introduced, three more concrete hardening items, and one
factual claim that didn't hold up under a direct check:

- **Verified and rejected:** the claim that "this project currently had
  LiveKit backend tests failing" was checked directly against this
  session's working tree — `backend/tests/test_main.py`'s three
  `test_livekit_token_*` tests, and the full 22-test suite, all pass
  (`pytest`, zero failures). Recorded here so this doesn't get re-asserted
  later without a repro; if a future run does show a failure, that's a
  regression to investigate on its own, not a pre-existing condition.
- **Resolved, not deferred:** token verification was flagged as an
  implementation unknown to spike first. Checked directly against the
  installed `livekit-api` package instead of deferring it — `TokenVerifier`
  exists with exactly the shape needed (`.verify(token) -> Claims` with
  `.identity`, `.name`, `.video.room`). The **Identity verification**
  section below now states the confirmed API instead of a hedge.
- **Fixed:** a real contradiction between two sections — one said the
  session WS itself rejects when `DEEPGRAM_API_KEY` is unset, another said
  only `captions_on` does. The latter is correct and is what's now written
  throughout: presence must work with no Deepgram key at all; only caption
  capture depends on it.
- **Fixed:** the LiveKit token no longer travels as a WS query param
  (logged too easily by proxies/access logs) — it's now the first message
  sent after the socket connects, verified before any other frame is
  processed.
- **Fixed:** `GET .../transcript-so-far` now requires the same token,
  checked against the room it's requesting — cheap to add given the same
  verification already exists for the session WS, so there's no reason to
  leave a live, real transcript open to anyone who guesses a room name.
- **Fixed:** finalization now records `started_at`/computed `duration`
  (reusing the `Meeting` model's existing `date`/`duration` columns — no
  schema change needed) and generates a distinguishing title instead of
  the bare room name, so a demo where every call uses the default
  `team-sync` room doesn't produce indistinguishable Meeting Intelligence
  entries.
- **Fixed:** `_sessions` mutation (create/increment/decrement/schedule- or
  cancel-finalization) is now specified as lock-protected — this state is
  touched by concurrent WebSocket-handling tasks and several of those
  operations span an `await`, which is exactly the case Python's
  single-threaded-so-no-races intuition doesn't cover.
- **Fixed:** the demo/keyless fallback judge now produces a distinguishably
  labeled `Flag` (a new `judge` field) rather than being visually
  indistinguishable from a real LLM judgment — consistent with this app's
  existing transparency posture (Ask Coco already exposes its raw Cypher
  for the same reason).

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

1. **Post-call persistence:** when a live call ends, it becomes a real
   `Meeting` — same Gemini extraction → decisions/action items/contradiction
   pipeline as an uploaded recording. Live meetings show up in Meeting
   Intelligence, the Dashboard, and the knowledge graph exactly like
   uploads. (Rejected: ephemeral-only, or persisting the transcript without
   re-running extraction.) **Conditional on decision 3b below:** this
   applies to calls where live transcript capture was actually used — a
   call nobody enables it for stays exactly as ephemeral as it is today.
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
   - **3a. Presence tracking (added post-review):** every participant's
     client opens a lightweight session WebSocket automatically on joining
     the room — this drives whether a live-meeting session exists at all,
     independent of anyone's caption preference.
   - **3b. Capture itself stays opt-in (re-confirmed post-review):** actual
     mic audio is only sent, and Deepgram only invoked, while a participant
     has explicitly toggled Live Transcript on — same consent model as the
     whiteboard/Coco/recording toggles already in the room. (Rejected:
     always capturing regardless of the toggle — guarantees decision 1
     unconditionally, but transcribes participants into a durable,
     org-wide knowledge graph without a per-call opt-in, and runs billed
     Deepgram usage on every live meeting whether or not anyone wants
     captions.)

A useful side effect of decision 3: since each caption comes from a
specific participant's own microphone, the speaker label is that
participant's real LiveKit identity — no diarization guessing required, and
actually more accurate than the post-hoc Deepgram diarization uploads go
through today.

## Session lifecycle

This is the mechanism that fixes the review's top finding, so it's called
out on its own rather than buried in a component list.

- **On entering the live room**, every participant's client opens `WS
  /live-meeting/{room_name}/session` automatically — not gated by the
  caption toggle — then immediately sends its LiveKit access token as the
  first frame (see **Auth handshake**). The backend verifies it server-side
  (see **Identity verification** below) and, on success, increments that
  room's `active_connections`. This is what
  creates the room's `LiveMeetingSession` on the first participant and
  makes it eligible for finalization when the last one leaves — entirely
  independent of whether captions were ever turned on.
- **Toggling Live Transcript on** sends a `{"type": "captions_on"}` control
  message over that same already-open connection; only from that point does
  the client send binary audio frames, and only then does the backend open
  a Deepgram live connection for it. **Toggling it off** (or muting the mic
  in LiveKit — see **Frontend components**) sends `{"type":
  "captions_off"}`, stops audio frames, and closes the Deepgram connection
  — but the session WebSocket itself, and therefore room presence, stays
  open.
- **On disconnect** (tab close, leave, refresh): decrement
  `active_connections`. If it hits 0, start a ~45s grace timer (cancelled if
  a new connection for the same room arrives first). At expiry: if
  `segments` is non-empty, finalize (see below); if empty, drop the session
  — no `Meeting` row, no Celery dispatch, matching decision 3b.
- **Finalization**: persist `segments` via `StorageService`, create the
  `Meeting` row (generated title, not the bare room name — see
  **Finalization metadata** below; `file_path` = `None`), dispatch
  `process_live_meeting_task.delay(meeting_id)` (task reads the persisted
  segments itself — see **Celery payload** below).

This keeps the feature independent of LiveKit's own room lifecycle/webhooks
(still out of scope — see below) while fixing the bug: presence is driven by
a connection that exists for as long as the participant is in the room, not
by their current caption preference.

## Architecture overview

```
 participant's browser                     FastAPI backend                    external
 ─────────────────────                     ────────────────                   ────────
 opens on room join   ------------------->  WS /live-meeting/{room}/
 (session WS, independent                   session
  of caption toggle)                               |
 first frame sent: {auth, token} ----------------->|
                                                   | verifies token (never a
                                                   | query param), tracks
                                                   | active_connections
                                                   | (session lifecycle) —
                                                   | works with NO Deepgram
                                                   | key configured
                                                   |
 "captions_on" control msg ---------------------->|
 mic track (already published    audio            v                  audio    Deepgram
 to LiveKit) --MediaRecorder-->  frames -->  per-connection   ------------->   live streaming
 (stops on toggle-off or mute)               Deepgram proxy                   API
                                             (live_transcription_service.py)
                                                   |
                                     caption line  | tags with this
                                     back over WS  | connection's VERIFIED
                                             <------  identity, appended to
                                                      in-memory
                                                      LiveMeetingSession.segments
                                                   |
                                                   | keyword gate + ~15s/room
                                                   | cooldown -> passes?
                                                   v
                                     contradiction_service.check_text()
                                     (embedding_service.query_similar_decisions
                                      + demo-safe judge, see below)
                                                   |
                                     suggestion <---
                                     back over WS (only to the
                                     connection that triggered it)

 receiving client renders its OWN caption/suggestion locally immediately
 (already has the data from its own WS response), AND republishes it via
 room.localParticipant.publishData(topic: 'live-transcript' | 'live-suggestion')
 -> every OTHER participant's browser receives it via
    room.on(RoomEvent.DataReceived, ...) — the exact pattern
    CollaborativeWhiteboard.tsx already uses. A late joiner additionally
    calls GET /live-meeting/{room}/transcript-so-far once on mount to
    hydrate history the data channel can't replay.

 On active_connections reaching 0 + ~45s grace period, if segments is
 non-empty:
   persist segments (StorageService) -> create Meeting row
   -> process_live_meeting_task.delay(meeting_id)
   -> _analyze_transcript() [new, shared with the upload pipeline]
   -> _save_and_graph() [existing, unchanged]
```

The backend never broadcasts to other participants itself — it only ever
talks 1:1 with the connection that sent it audio. All fan-out to the rest of
the room happens client-side over LiveKit's existing data channel, so there
is exactly one fan-out mechanism in the codebase (the whiteboard's), not two.

## Backend components

### Identity verification

The client sends the *same* LiveKit access token it already obtained from
`POST /livekit/token` to join the room — never a free-form identity string,
and never as a WS query param (see **Auth handshake** below for why).
Confirmed directly against the installed `livekit-api` package this
session (`backend/.venv`), not left as an open question:

```python
verifier = livekit_api.TokenVerifier(settings.livekit_api_key, settings.livekit_api_secret)
claims = verifier.verify(token)  # raises on invalid/expired signature
identity, display_name, room = claims.identity, claims.name, claims.video.room if claims.video else None
```

`claims.video.room` is checked against the `room_name` in the URL — a
valid token for a *different* room is rejected too, not just an invalid
one. No caption, suggestion, or transcript line is ever attributed to a
client-supplied string again.

#### Auth handshake

The token is **not** a query param. FastAPI's WebSocket flow requires
`accept()` before any application message can be exchanged, so the sequence
is: accept the socket, then require `{"type": "auth", "token": "..."}` as
strictly the first frame — verify it before processing any other message
(control or audio), and close immediately with a clear reason if the first
frame isn't a valid auth message or the token doesn't verify. This avoids
the token ever appearing in a URL that proxies, load balancers, or access
logs commonly capture. (Browsers can't attach custom headers — e.g.
`Authorization` — to a WebSocket upgrade request from JS, which is why this
uses a first-message handshake instead of a header.)

### `app/services/live_transcription_service.py` (new)

Thin proxy to Deepgram's live streaming WebSocket
(`wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&punctuate=true&language=en`)
— same `nova-2` model the existing REST path
(`asr_service.run_deepgram_transcription`) uses, for consistent transcript
quality/style between live and uploaded meetings. One Deepgram connection
per participant, opened lazily on `captions_on` and closed on `captions_off`
or disconnect (not held open for the whole call regardless of caption
state — keeps idle cost at zero when nobody wants captions). Only forwards
`is_final: true` results upstream; interim results are used only for a
"typing"-style indicator client-side, never appended to the durable
transcript. Sends a Deepgram `KeepAlive` message on a short interval (~5-8s)
whenever no real audio has been forwarded recently, so a pause in speech
doesn't time out the connection.

**Audio format:** the client sends `MediaRecorder`-produced WebM/Opus chunks
(same container the local-recording feature already uses). Per Deepgram's
own guidance, containerized WebM/Opus omits `encoding`/`sample_rate`
entirely (Deepgram auto-detects from the container) — the query string above
is deliberately missing both for this reason, not by oversight.
`MediaRecorder` + short timeslice chunking is a known rough edge for
streaming decoders (only the first chunk carries full container/init
headers); this needs an early smoke-test against Deepgram before building
the rest of the feature on top of it, not just an assumption that it works.

### `app/api/live_meeting.py` (new router)

`WS /live-meeting/{room_name}/session` (renamed from an earlier
`/transcribe` draft — this connection now represents room presence, not
just transcription; see **Session lifecycle**). No `token` query param —
see **Auth handshake** above. Per connection:

1. Accept the WS. Require `{"type": "auth", "token": "..."}` as the first
   frame; verify it (see **Identity verification**); close with a clear
   reason on failure. **This is the only rejection condition for the
   session WS itself** — critically, it does **not** depend on
   `settings.deepgram_api_key`. Presence/session tracking must work with no
   Deepgram key configured at all; only step 3 below depends on it.
2. Increment `active_connections` for this room's session under that
   session's lock (creating the session on first connection — see
   **Concurrency** below).
3. On `{"type": "captions_on"}`: reject with a clear in-band error if
   `settings.deepgram_api_key` is unset (this is where that check belongs —
   see point 1); otherwise open a Deepgram connection via
   `live_transcription_service`. On each finalized Deepgram result: build
   `{speaker: verified_display_name, identity: verified_identity, text,
   timestamp}`, append to `LiveMeetingSession.segments`, send it back down
   this client's WS.
4. Run the keyword gate on the text; if it passes AND the room's cooldown
   has elapsed, call `contradiction_service.check_text(text,
   exclude_meeting_id=session.id)` — `session.id` is a session uuid, not a
   real `Meeting.id` (none exists yet during a live call), but it's a safe
   value to pass: nothing in the graph can reference an id that doesn't
   exist yet, so it excludes nothing and is purely there to satisfy the
   same function signature `check_decisions()` uses post-call. On a `Flag`,
   send `{type: "contradiction_suggestion", ...flag}` back down this same
   client's WS.
5. On `{"type": "captions_off"}`: close this connection's Deepgram link,
   stop appending segments from it.
6. On disconnect: close any open Deepgram connection, decrement
   `active_connections` under the session's lock; if it hits 0, schedule
   finalization per **Session lifecycle** above.

### `GET /live-meeting/{room_name}/transcript-so-far` (new)

Returns the room's `LiveMeetingSession.segments` accumulated so far (empty
list if no active session). Read-only, no side effects. **Requires the same
LiveKit token**, passed as `Authorization: Bearer <token>` — verified the
same way as the session WS (see **Identity verification**), including the
`claims.video.room == room_name` check. Unlike the rest of this app's
current no-auth endpoints, this one serves the actual live content of an
in-progress conversation rather than already-processed meeting records, and
the verification needed already exists once the session WS has it — there's
no cost reason to leave it open.

### In-memory session registry

`_sessions: dict[str, LiveMeetingSession]` keyed by `room_name`, module-level
in `live_meeting.py`. `LiveMeetingSession`: `id` (uuid, independent of
`room_name` so a reused room name like "team-sync" across different days
doesn't collide), `started_at: datetime`, `segments: list[dict]`,
`active_connections: int`, `last_contradiction_check: float`, `lock:
asyncio.Lock`. Single-process, in-memory state — matches the rest of this
hackathon prototype's complexity level (SQLite, single Celery worker
assumed); no Redis-backed session state. Lost on a backend restart (see
Out of scope).

#### Concurrency

`_sessions` is touched by every session WS's own async task, and several of
the operations on it span an `await` (scheduling/cancelling the finalize
grace-timer, and finalization itself, which reads segments and writes to
storage/DB). That combination is exactly where Python's "single event loop,
so no races" intuition breaks down — two tasks can interleave in the middle
of a multi-step state change. Fixes:

- Getting-or-creating a room's `LiveMeetingSession` (the one operation that
  touches the `_sessions` dict itself, not a session's internals) is guarded
  by one small module-level lock, held only for that lookup-or-insert.
- Everything else — increment/decrement `active_connections`, schedule or
  cancel the finalize grace-timer, run finalization — is guarded by that
  session's own `lock`, not the module-level one, so unrelated rooms never
  block each other.

#### Finalization metadata

No new `Meeting` columns needed — reuses existing nullable fields.
`started_at` comes from the session; `ended_at` is "now" at finalization
time. `Meeting.duration` gets the computed `HH:MM:SS` span (same format
`_run_pipeline` already produces elsewhere), `Meeting.date` gets
`started_at` formatted, and `Meeting.title` becomes a generated,
distinguishing string — e.g. `f"Live: {room_name} — {started_at:%Y-%m-%d %H:%M}"`
— instead of the bare room name, so repeated calls in the same default
`team-sync` room (the app's own documented example room ID) don't produce
indistinguishable Meeting Intelligence entries. Participant names need no
separate handling — they flow into the graph the same way an upload's do,
via `_analyze_transcript`/`_save_and_graph` once segments are processed.

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
    the judge whether they genuinely conflict. Returns a Flag on a real
    contradiction, None otherwise."""
```

`check_decisions()` becomes a thin loop calling `check_text()` per decision —
a behavior-preserving refactor. Existing tests covering contradiction
detection must still pass unchanged.

#### Demo-safe contradiction judging

`_judge_contradiction()` currently returns `None` (no flag) whenever neither
`gemini_api_key` nor `agnes_api_key` is configured — correct fail-closed
behavior for an unexpected outage, but wrong for the *expected, common*
keyless-demo configuration this project's own `DEMO_MODE` exists for: it
would make live suggestions silently never fire during a demo. Fix: when
both keys are empty, fall back to a deterministic keyword-based judge —
opposing-term pairs (approve/reject, increase/freeze, proceed/halt,
hire/layoff, and similar) checked between the new text and the matched past
decision. This is not new scope; it's re-enabling the "Demo path" `Task
4.4` in `docs/IMPLEMENTATION_PLAN.md` already specified before the
embedding+Gemini "real path" superseded it — the real path stays the
default whenever a key is configured, exactly as today. The embedding
search itself (`query_similar_decisions`) needs no change — it runs fully
locally via `sentence-transformers`, no API key involved.

**Must be visibly labeled, not presented as an LLM judgment.** `Flag` gains
one new field, `judge: str = "llm"` (default preserves every existing call
site unchanged), set to `"keyword_fallback"` when that path produced the
flag. The suggestion banner and any other `Flag`-rendering UI show a
distinct label when `judge == "keyword_fallback"` (e.g. "Pattern-matched —
not AI-verified" vs. no badge for an LLM judgment). This matches the app's
existing transparency posture — Ask Coco already exposes its raw Cypher for
the same reason (`docs/IMPLEMENTATION_PLAN.md` calls this "Cypher
transparency") — a deterministic keyword match presented as if it were the
same AI reasoning would be a step backward from that.

### `app/tasks/meeting_tasks.py` (extended)

- Extract the Gemini-extraction-through-contradiction tail of `_run_pipeline`
  (everything from building `transcript_text` through setting
  `intelligence.flags`) into `_analyze_transcript(meeting, segments,
  on_progress) -> MeetingIntelligence`. `_run_pipeline` becomes: extract
  audio, transcribe, then call `_analyze_transcript`. No vision/nameplate
  step for live sessions — there's no separate video file to sample frames
  from, matching how uploads already skip vision for non-`.mp4` files.
- Extract the generic retry/status-transition shell of `process_meeting_task`
  (DB status transitions, retry/backoff, error persistence) into a shared
  helper parameterized by which pipeline function to run, so the new task
  reuses it instead of reimplementing retry logic.
- New task: `process_live_meeting_task(meeting_id)` — **takes only the
  meeting id, not the transcript** (see below). Loads the `Meeting` row,
  reads its persisted segments back via `StorageService`, calls
  `_analyze_transcript(meeting, segments, on_progress)`, then the existing
  `_save_and_graph(meeting, intelligence)` unchanged.

#### Celery payload

The original draft passed `segments` directly as a task argument. Fixed:
`live_meeting.py`'s finalization step writes `segments` to storage first
(reusing the `StorageService` abstraction the upload path already uses for
transcripts/summaries) and dispatches
`process_live_meeting_task.delay(meeting_id)` — mirroring exactly how
`process_meeting_task(meeting_id)` already works for uploads (task takes an
id, reads its real payload from disk, not from the Redis broker message).
Avoids bloating Redis (which is both broker *and* result backend here —
`backend/app/core/celery_app.py`) with potentially large transcript text for
longer meetings.

## Frontend components

### `useLiveMeetingSession` hook (new, renamed from `useLiveTranscription`)

Opens the `/session` WebSocket automatically once the participant has
joined the LiveKit room (independent of the caption toggle — see **Session
lifecycle**). Exposes a `captionsEnabled` control tied to the toggle button:
turning it on sends `{"type": "captions_on"}` and starts capturing the
local mic via `MediaRecorder` on a short timeslice — same technique already
proven in `MeetingRecorder.tsx`, using the *same* `MediaStreamTrack` LiveKit
already publishes (via `useTracks`), not a separate `getUserMedia()` call.

**Must respect LiveKit mute state**: the hook watches
`isLocalParticipant.isMicrophoneEnabled` (already tracked in
`MeetingRoomView.tsx`'s `RoomContent`) and stops sending audio frames
whenever it's `false`, sending `{"type": "captions_off"}` if captions were
on — muting your mic in the LiveKit toolbar must stop transcription too,
not just stop the audio *other participants* hear.

On each caption/suggestion received back over its own WS response, the hook
**renders it locally immediately** (this client already has the full
payload — no need to wait for anything), and separately republishes it via
`room.localParticipant.publishData(payload, {topic: 'live-transcript'})` or
`'live-suggestion'` so every *other* participant's browser receives it
through `RoomEvent.DataReceived`. This split matters:
`CollaborativeWhiteboard.tsx` follows the same shape (local Excalidraw state
updates directly; `publishData`/`DataReceived` only syncs to others) — a
component that only rendered on the `DataReceived` round-trip would never
show the speaker their own captions.

### `LiveTranscriptPanel.tsx` (new)

New toggle button beside the existing Coco toggle in `MeetingRoomView.tsx`'s
bottom toolbar. On mount, calls `GET
/live-meeting/{room}/transcript-so-far` once to hydrate any history from
before this participant joined (the LiveKit data channel has no replay/
history of its own — this is the same late-join problem
`docs/LIVEKIT_MEETING.md` already documents for the whiteboard, solved here
via a backend read instead of a peer request, since the backend already
holds the segments as source of truth and doesn't depend on any specific
peer still being connected). Thereafter: scrolling, speaker-labeled caption
feed, subscribed via `room.on(RoomEvent.DataReceived, handler)` filtering on
the `'live-transcript'` topic.

### Suggestion banner

Dismissible card in the same rose/`ShieldAlert` visual language the app
already uses for contradictions (Header notification bell's `case
'contradiction'`, Memory Graph's red-dashed `CONTRADICTS` edges). Rendered
above whatever panels (whiteboard/Coco/transcript) are currently open in
`MeetingRoomView.tsx`, subscribed to the `'live-suggestion'` data topic the
same way the transcript panel subscribes to `'live-transcript'`.

## Error handling

Transcription capture is strictly opt-in and bolt-on — nothing about it can
break the actual video call, which keeps working regardless of its state.
The session WS itself is lightweight and auto-connects, but its failure
(e.g. token rejected) only disables live-meeting-specific features, never
the call.

- Invalid/expired token → session WS connection rejected immediately with a
  clear close reason; frontend treats this like any other connection error
  (small inline notice, live-meeting features simply unavailable).
- Deepgram connection fails or drops mid-call → backend closes that
  participant's Deepgram link and sends a `captions_error` message down
  their session WS; frontend shows a small inline error in the transcript
  panel (mirrors the existing `mediaError` banner pattern in
  `MeetingRoomView.tsx`), the toggle resets to off. The session WS itself
  stays open (presence is unaffected).
- `DEEPGRAM_API_KEY` unset → `captions_on` is rejected with a clear error
  message; no separate capability-probe endpoint.
- Neither Gemini nor Agnes configured → live suggestions use the
  deterministic fallback judge (see **Demo-safe contradiction judging**),
  not silent failure.
- Browser lacks `MediaRecorder` or mic permission is denied → same inline
  error path the existing camera/mic toggles already use.
- Call-end processing failure → reuses the exact retry/backoff/`failed`
  status machinery `process_meeting_task` already has, via the shared shell
  extracted above.
- No segments accumulated (nobody ever toggled captions on, or toggled
  on/off with nobody speaking) → finalize is a no-op; no `Meeting` row, no
  Celery dispatch.

## Testing

**Backend (automated):**
- `check_text()` — unit tests with synthetic decision pairs; regression-check
  that `check_decisions()`'s existing behavior/tests are unchanged after the
  extraction.
- Demo-safe judge fallback — unit test confirming a contradiction is still
  detected via the keyword path when both `gemini_api_key` and
  `agnes_api_key` are empty.
- `_looks_decision_like()` — pure function, table-driven test over
  should-trigger / shouldn't-trigger phrases.
- `_analyze_transcript()` / refactored `_run_pipeline()` — the upload path
  must produce identical output to today; run against whatever existing
  fixture `test_phase_contracts.py` already uses.
- Auth handshake — a connection sending anything other than a valid
  `{"type": "auth", "token": ...}` as its first frame (wrong message type,
  missing/invalid/expired token, or a token valid for a *different* room)
  must be rejected before any other message is processed and before any
  segment is ever attributed to it. A missing/unset `DEEPGRAM_API_KEY` must
  **not** reject the session WS itself — only a subsequent `captions_on`.
- Concurrency — two connect/disconnect sequences for the same room in rapid
  succession must not double-finalize, lose a pending finalize-cancellation,
  or drop a segment; a fresh connection arriving during the grace period
  must cancel the pending finalize.
- Finalization metadata — generated `title`/`date`/`duration` for two
  live meetings using the same room name on different days must be
  distinguishable from each other.
- Demo-safe judge labeling — a `Flag` produced by the keyword fallback must
  carry `judge == "keyword_fallback"`, distinct from the default `"llm"`.

**First implementation step, before building the rest:** a small standalone
spike sending real `MediaRecorder` WebM/Opus chunks to Deepgram's live
endpoint and confirming it transcribes correctly — the audio-format risk
flagged above is cheap to de-risk early and expensive to discover late.

**Frontend:** no automated coverage for the WebSocket+MediaRecorder audio
path (not practical to mock meaningfully). Verified manually instead: two
browser profiles in the same live room (per the existing testing steps in
`docs/LIVEKIT_MEETING.md`), confirming captions and a triggered contradiction
suggestion both appear on both sides, muting stops captions, and a
third profile joining late sees prior history. This will be driven for real
in the preview browser once built, not just asserted.

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
- LiveKit webhooks / server-side room-lifecycle integration — presence is
  handled by the app's own lightweight session WebSocket instead (see
  **Session lifecycle**), not by subscribing to LiveKit's server-side
  participant events.
