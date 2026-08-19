"""Deterministic Ask Coco queries backed by predefined Cypher templates.

The Cypher stays fixed/parameterized (never LLM-generated) for the same
safety and transparency reasons as before — what changed is what happens
to the *results* of that query: they're summarized into a natural answer
(via Gemini, same client already used for meeting analysis) instead of
being joined into a raw "field - field - field" string, and template
selection now tolerates far more phrasings than a handful of exact
keywords."""
import json
import re
from collections.abc import Callable

from app.core.config import get_settings
from app.core.logger import get_logger
from app.graph.neo4j_service import run_query
from app.services.storage_service import StorageService

logger = get_logger(__name__)
settings = get_settings()
storage = StorageService()

# Meeting summaries only ever get written to storage/summaries/{id}.json
# (graph_builder only puts id/title on the Meeting node, never the summary
# text) — so "summarize X" can't be answered by any Cypher template at all
# and needs its own lookup path: find which meeting is meant, then read its
# stored summary file instead of querying the graph for it.
_SUMMARY_KEYWORDS = (
    "summarize", "summarise", "summary", "recap", "overview", "brief me",
    "what happened in", "what was discussed",
)

QueryBuilder = Callable[[str], tuple[str, dict]]


def _person_from_query(query: str) -> str | None:
    # "for/of/assigned to <name>", not just "for <name>" — covers a lot more
    # of how people actually phrase this.
    match = re.search(
        r"\b(?:for|of|assigned to|owned by)\s+([A-Za-z][A-Za-z .'-]+?)(?:[?.!,]|$)",
        query,
        re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def _action_items(query: str) -> tuple[str, dict]:
    person = _person_from_query(query)
    cypher = (
        "MATCH (a:ActionItem)-[:ASSIGNED_TO]->(p:Person) "
        "OPTIONAL MATCH (a)-[:MADE_IN]->(m:Meeting) "
        "WHERE $person IS NULL OR toLower(p.name) = toLower($person) "
        "RETURN a.task AS task, p.name AS assignee, a.deadline AS deadline, "
        "a.priority AS priority, m.title AS meeting ORDER BY a.deadline"
    )
    return cypher, {"person": person}


def _decisions(_: str) -> tuple[str, dict]:
    return (
        "MATCH (d:Decision)-[:MADE_IN]->(m:Meeting) "
        "OPTIONAL MATCH (d)-[:MADE_BY]->(p:Person) "
        "RETURN d.text AS decision, d.confidence AS confidence, p.name AS speaker, "
        "m.title AS meeting ORDER BY d.timestamp",
        {},
    )


def _contradictions(_: str) -> tuple[str, dict]:
    return (
        "MATCH (current:Decision)-[r:CONTRADICTS]->(previous:Decision) "
        "OPTIONAL MATCH (current)-[:MADE_IN]->(m:Meeting) "
        "RETURN current.text AS decision, previous.text AS conflicts_with, "
        "r.message AS message, m.title AS meeting",
        {},
    )


def _participants(_: str) -> tuple[str, dict]:
    return (
        "MATCH (p:Person)-[:PARTICIPATED_IN]->(m:Meeting) "
        "RETURN p.name AS participant, collect(m.title) AS meetings "
        "ORDER BY participant",
        {},
    )


def _meetings(_: str) -> tuple[str, dict]:
    return (
        "MATCH (m:Meeting) OPTIONAL MATCH (p:Person)-[:PARTICIPATED_IN]->(m) "
        "RETURN m.id AS id, m.title AS meeting, collect(p.name) AS participants "
        "ORDER BY meeting",
        {},
    )


# Each entry: (keywords, builder, kind). "kind" drives both the no-LLM
# fallback formatter and what Gemini is told it's summarizing.
_TEMPLATES: tuple[tuple[tuple[str, ...], QueryBuilder, str], ...] = (
    (
        ("action", "task", "todo", "commitment", "assign", "deadline", "due",
         "follow up", "follow-up", "responsible", "owe", "next step"),
        _action_items,
        "action_items",
    ),
    (
        ("contradiction", "conflict", "flag", "disagree", "inconsistent",
         "clash", "contradict"),
        _contradictions,
        "contradictions",
    ),
    (
        ("decision", "decide", "approved", "agreement", "agreed", "resolve",
         "resolved", "conclude", "concluded", "chose", "choose", "chosen"),
        _decisions,
        "decisions",
    ),
    (
        ("participant", "attendee", "speaker", "who", "attended", "present",
         "involve", "join"),
        _participants,
        "participants",
    ),
)


def _find_meeting(query: str) -> dict | None:
    """Best-effort match of a meeting title mentioned in the query against
    every known meeting. A whole-title substring match wins outright;
    otherwise the meeting with the most distinctive-word overlap wins, as
    long as it clears a minimum bar (avoids matching on a single common
    word)."""
    meetings = run_query("MATCH (m:Meeting) RETURN m.id AS id, m.title AS title")
    lowered = query.lower()
    best, best_overlap = None, 0
    for m in meetings:
        title = m.get("title") or ""
        if not title:
            continue
        title_lower = title.lower()
        if title_lower in lowered:
            return m
        words = [w for w in re.findall(r"[a-z0-9]+", title_lower) if len(w) > 3]
        overlap = sum(1 for w in words if w in lowered)
        if words and overlap >= max(2, len(words) // 2) and overlap > best_overlap:
            best, best_overlap = m, overlap
    return best


def _meeting_summary_text(meeting_id: str) -> str | None:
    try:
        data = json.loads(storage.get_file(f"summaries/{meeting_id}.json"))
        return data.get("summary") or None
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _select_template(query: str) -> tuple[QueryBuilder, str]:
    lowered = query.lower()
    for keywords, builder, kind in _TEMPLATES:
        if any(keyword in lowered for keyword in keywords):
            return builder, kind
    return _meetings, "meetings"


def _format_answer_fallback(kind: str, results: list[dict]) -> str:
    """No-LLM formatter — used when Gemini is unavailable/fails. Real
    sentences per template kind instead of a raw "field - field" join."""
    if not results:
        return {
            "action_items": "No action items found for that.",
            "decisions": "No matching decisions were found.",
            "contradictions": "No contradictions found in the graph.",
            "participants": "No matching participants were found.",
            "meetings": "No meetings were found.",
        }.get(kind, "No matching meeting records were found.")

    lines: list[str] = []
    for row in results[:10]:
        if kind == "action_items":
            deadline = f" (due {row['deadline']})" if row.get("deadline") else ""
            meeting = f" — from {row['meeting']}" if row.get("meeting") else ""
            lines.append(f"[{row.get('priority', 'medium')}] {row.get('task')} — {row.get('assignee') or 'unassigned'}{deadline}{meeting}")
        elif kind == "decisions":
            speaker = f" ({row['speaker']})" if row.get("speaker") else ""
            meeting = f" in {row['meeting']}" if row.get("meeting") else ""
            lines.append(f"{row.get('decision')}{speaker} — {row.get('confidence', 'unknown confidence')}{meeting}")
        elif kind == "contradictions":
            meeting = f" ({row['meeting']})" if row.get("meeting") else ""
            lines.append(f"\"{row.get('decision')}\" conflicts with \"{row.get('conflicts_with')}\"{meeting}: {row.get('message', '')}")
        elif kind == "participants":
            meetings = ", ".join(row.get("meetings") or [])
            lines.append(f"{row.get('participant')} — {meetings}")
        else:
            meeting = row.get("meeting")
            participants = ", ".join(row.get("participants") or [])
            lines.append(f"{meeting} — {participants}" if participants else str(meeting))
    return "\n".join(lines)


def _citations_for(kind: str, results: list[dict]) -> list[dict]:
    """Evidence for the answer above it — which meeting each fact actually
    came from, so the answer is checkable instead of just trusted. Every
    field is a plain string per the /query Citation schema."""
    citations: list[dict] = []
    for row in results[:10]:
        if kind == "summary":
            citations.append({
                "filename": row.get("meeting") or "",
                "timestamp": "",
                "speaker": "",
                "excerpt": (row.get("summary") or "")[:280],
            })
        elif kind == "decisions":
            citations.append({
                "filename": row.get("meeting") or "",
                "timestamp": "",
                "speaker": row.get("speaker") or "",
                "excerpt": row.get("decision") or "",
            })
        elif kind == "action_items":
            citations.append({
                "filename": row.get("meeting") or "",
                "timestamp": row.get("deadline") or "",
                "speaker": row.get("assignee") or "",
                "excerpt": row.get("task") or "",
            })
        elif kind == "contradictions":
            citations.append({
                "filename": row.get("meeting") or "",
                "timestamp": "",
                "speaker": "",
                "excerpt": f'"{row.get("decision")}" vs. "{row.get("conflicts_with")}" — {row.get("message") or ""}',
            })
        # participants/meetings are directory listings, not a claim that
        # needs a specific source quoted back — no citations for those.
    return citations


def _synthesize_with_gemini(query: str, kind: str, results: list[dict]) -> str | None:
    """Ask Gemini to turn already-fetched, already-safe structured rows into
    a natural answer. Gemini never sees or writes Cypher and never touches
    the graph — it only summarizes data this module already retrieved, so
    this can't introduce an injection/authorization risk. Returns None on
    any failure so the caller can fall back to the deterministic formatter."""
    if not settings.gemini_api_key:
        return None
    try:
        from google import genai

        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = f"""You are Coco, a corporate meeting-intelligence assistant. Answer the user's
question using ONLY the JSON data below — it was already retrieved from the
organization's knowledge graph for exactly this question. Do not invent facts
not present in the data. If the data is empty, say so plainly and suggest
what the user could ask instead (decisions, action items, contradictions, or
participants). Keep the answer to 2-4 sentences, conversational, no
markdown/bullet formatting.

Question: {query}
Data (kind={kind}): {results[:15]}
"""
        response = client.models.generate_content(model="gemini-flash-latest", contents=prompt)
        text = (response.text or "").strip()
        return text or None
    except Exception as exc:
        logger.warning("Ask Coco: Gemini synthesis failed, using fallback formatter: %s", exc)
        return None


def ask(query: str) -> dict:
    """Map a natural-language question to a safe, predefined Cypher query,
    then synthesize a natural answer from the results."""
    if not query.strip():
        return {"answer": "Please ask a question.", "results": [], "cypher": "", "citations": []}

    lowered_query = query.lower()
    if any(keyword in lowered_query for keyword in _SUMMARY_KEYWORDS):
        note = "MATCH (m:Meeting) RETURN m.id, m.title  -- then read its stored summary (not graph data)"
        meeting = _find_meeting(query)
        if not meeting:
            return {
                "answer": "I couldn't tell which meeting you mean — try including its title, e.g. \"summarize the Vendor Contract Review meeting\".",
                "results": [], "cypher": note, "citations": [],
            }
        summary_text = _meeting_summary_text(meeting["id"])
        if not summary_text:
            return {
                "answer": f'"{meeting["title"]}" doesn\'t have a stored summary yet.',
                "results": [meeting], "cypher": note, "citations": [],
            }
        row = {"meeting": meeting["title"], "summary": summary_text}
        answer = _synthesize_with_gemini(query, "summary", [row]) or summary_text
        return {"answer": answer, "results": [row], "cypher": note, "citations": _citations_for("summary", [row])}

    builder, kind = _select_template(query)
    cypher, params = builder(query)
    try:
        results = run_query(cypher, **params)
    except Exception:
        return {
            "answer": "The meeting graph is unavailable. Start Neo4j and try again.",
            "results": [],
            "cypher": cypher,
            "citations": [],
        }

    answer = _synthesize_with_gemini(query, kind, results) or _format_answer_fallback(kind, results)

    return {
        "answer": answer,
        "results": results,
        "cypher": cypher,
        "citations": _citations_for(kind, results),
    }
