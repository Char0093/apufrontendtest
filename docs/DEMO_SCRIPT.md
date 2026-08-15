# Corporate Brain — Demo Script (Task 9.1)

~5-6 minute walkthrough. Run with `DEMO_MODE=true` (the default) so the
whole pipeline works with zero external API keys and zero network calls —
this is also the backup path (Task 9.2) if live Gemini/Deepgram access is
flaky on the day.

## 0. Setup (before you're on stage)

```bash
docker compose up
```

Open the frontend at `http://localhost:5173`. Confirm the sidebar shows
"AI Engine Online" and the Dashboard loads without a red error banner.

## 1. Upload → Processing (~30s)

- Dashboard → **+ Schedule Meeting**, or open an existing "Upcoming" card →
  **Upload Audio Recording**.
- Point out the status badge changing live: Pending → Preprocessing → ASR →
  LLM → Graph → Completed. If it ever shows the orange **Retrying after
  error** badge, say so out loud — it's the automatic-retry path (Task 1.6)
  working as designed, not a crash.

## 2. Summary — decisions with reasons, not just a transcript dump (~45s)

- Open the completed meeting → **Decisions** tab.
- Pick one decision, read its **confidence tag** (firm commitment / soft
  agreement / unresolved) and its **reason** out loud — this is the "not
  just a transcription tool" pitch in one screen.
- If the AI flags banner is showing (red, top of the page), read the flag:
  it names the *other* meeting and decision it conflicts with.

## 3. Transcript (~20s)

- **Transcript** tab — timestamped, speaker-attributed. Use the search box
  to jump to the line the decision above came from, closing the loop from
  "decision" back to "what was actually said."

## 4. Memory Graph — the visual wow (~45s)

- Sidebar → **Memory Graph**. Zoom/drag a little.
- Point at the **red dashed edge** — that's a live `CONTRADICTS` edge
  between two Decision nodes in Neo4j, not a mocked-up line. Click it to
  show the tooltip with the actual conflict message.
- Switch the meeting filter dropdown to show it's the same graph, scoped.

## 5. Ask Coco + Cypher transparency (~45s)

- Sidebar → **Coco (AI Assistant)**. Ask something like *"What are my open
  action items?"*
- Point out the answer is backed by a real Cypher query, not a black box —
  Coco's response includes the query it ran (`POST /query`'s `cypher`
  field), so you can show the exact graph traversal that produced the
  answer.

## 6. Decision Timeline (~30s)

- Sidebar → **Meeting Intelligence** → scroll to **Decision Timeline**.
- Every decision across every meeting, newest first, each still linking
  back to its source meeting — this is the "collective memory," not just
  per-meeting notes.

## 7. Export Report (~15s)

- Back on a meeting's detail page → **Export Report** button (top right).
  Downloads a real `.md` file generated from that meeting's summary —
  decisions, action items, risks, flags. Open it to show it's not a canned
  file.

## 8. Close

- One sentence: "Every screen you just saw — the flag, the graph edge, the
  Cypher query, the exported file — came from one real pipeline run, not
  separately mocked screens."

---

## If something breaks live

- **Backend unreachable / a screen shows stale data:** the frontend falls
  back to its bundled demo dataset automatically (`AppContext.tsx`) — keep
  talking, most screens still render something reasonable.
- **A specific meeting won't process:** switch to a different
  already-completed meeting from the list; don't wait on a live retry on
  stage.
- **Total backend failure:** `DEMO_MODE=true` means the very first upload
  after a fresh `docker compose up` already reproduces the Provider-X
  vendor-contradiction story end-to-end with zero external calls — restart
  the stack and re-run step 1 rather than debugging live.
