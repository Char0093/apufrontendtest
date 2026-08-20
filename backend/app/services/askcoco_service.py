import os
def _synthesize_with_groq(prompt: str) -> str | None:
    """Ultra-fast Groq LPU inference."""
    groq_key = getattr(settings, 'groq_api_key', None) or os.getenv('GROQ_API_KEY')
    if not groq_key:
        return None
    try:
        import urllib.request
        for model in ['qwen/qwen3.6-27b', 'openai/gpt-oss-120b']:
            try:
                req = urllib.request.Request(
                    'https://api.groq.com/openai/v1/chat/completions',
                    headers={'Authorization': f'Bearer {groq_key}', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'},
                    data=json.dumps({
                        'model': model,
                        'messages': [
                            {'role': 'system', 'content': 'You are Coco, an enterprise meeting-intelligence assistant. Give direct, helpful answers based on meeting records without thinking tags.'},
                            {'role': 'user', 'content': prompt}
                        ],
                        'max_tokens': 1024,
                        'temperature': 0.3
                    }).encode('utf-8')
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    data = json.loads(resp.read().decode())
                    raw_ans = data['choices'][0]['message']['content']
                    # If the response got truncated mid-<think> block (no
                    # closing tag), the reasoning trace would otherwise leak
                    # straight to the user — discard and try the next model.
                    if '<think>' in raw_ans and '</think>' not in raw_ans:
                        continue
                    clean_ans = re.sub(r'<think>.*?</think>', '', raw_ans, flags=re.DOTALL).strip()
                    if clean_ans:
                        return clean_ans
            except Exception:
                continue
    except Exception as e:
        logger.warning("Groq synthesis error: %s", e)
    return None

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

Current User: {active_user} ({user_role or "Staff"})
User Question: {query_scoped}
Data (kind={kind}): {results[:15]}
"""
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        text = (response.text or "").strip()
        return text or None
    except Exception as exc:
        logger.warning("Ask Coco: Gemini synthesis failed, using fallback formatter: %s", exc)
        return None


def ask(query: str, user_id: str | None = None, user_role: str | None = None) -> dict:
    """Query organizational & personalized user memory with Groq LPU + Gemini 2.5 Flash synthesis."""
    """Query organizational intelligence via Graph RAG or Storage RAG with Gemini 2.5 Flash synthesis."""
    if not query.strip():
        return {"answer": "Hello! I am Coco, your Corporate Brain AI. How can I help you regarding meetings, decisions, or action items?", "results": [], "cypher": "", "citations": []}

    lowered_query = query.lower()

    # Personalized Memory Scoping: Map "my tasks", "my decisions", "what should I do" to the active user
    active_user = user_id or "Current User"
    if user_id and ("my" in lowered_query or " i " in f" {lowered_query} " or "me" in lowered_query):
        query_scoped = re.sub(r'\b(my|i|me)\b', user_id, query, flags=re.IGNORECASE)
    else:
        query_scoped = query

    # Greetings & chit-chat
    if lowered_query in ("hi", "hello", "hey", "who are you", "help", "what can you do"):
        return {
            "answer": "Hello! I am Coco, your Corporate Brain AI assistant. I can query meeting transcripts, summarize decisions, track action items, and flag cross-meeting contradictions. What would you like to know?",
            "results": [],
            "cypher": "",
            "citations": []
        }

    # 1. Gather all stored meeting knowledge from storage
    stored_meetings = []
    citations = []
    try:
        summaries_dir = storage.base_path / "summaries"
        if summaries_dir.exists():
            for sf in summaries_dir.glob("*.json"):
                mid = sf.stem
                sum_data = storage.get_summary(mid) or {}
                stored_meetings.append({"id": mid, **sum_data})
    except Exception as e:
        logger.warning("Error reading stored summaries: %s", e)

    # 2. Extract relevant items
    results = []
    builder, kind = _select_template(query)
    
    # Try Neo4j if available
    try:
        if settings.neo4j_uri and "localhost" not in settings.neo4j_uri and "127.0.0.1" not in settings.neo4j_uri:
            cypher, params = builder(query)
            results = run_query(cypher, **params)
    except Exception:
        pass

    # If Neo4j yielded nothing or was offline, extract from stored summaries
    if not results and stored_meetings:
        if kind == "action_items":
            for m in stored_meetings:
                for a in m.get("action_items", []):
                    results.append({"task": a.get("task"), "assignee": a.get("assignee"), "deadline": a.get("deadline", "soon"), "meeting": m.get("title", m.get("id"))})
        elif kind == "decisions":
            for m in stored_meetings:
                for d in m.get("decisions", []):
                    results.append({"decision": d.get("decision") or d.get("text") or d.get("title"), "speaker": d.get("speaker"), "meeting": m.get("title", m.get("id"))})
        elif kind == "contradictions":
            for m in stored_meetings:
                for f in m.get("flags", []):
                    results.append({"decision": f.get("decision_a"), "conflicts_with": f.get("decision_b"), "message": f.get("message"), "meeting": m.get("title", m.get("id"))})
        else:
            for m in stored_meetings:
                results.append({"id": m.get("id"), "meeting": m.get("title", m.get("id")), "participants": m.get("participants", [])})

    # 3. Generate citations
    citations = _citations_for(kind, results)

    # 4. Synthesize with Groq LPU or Gemini 2.5 Flash
    answer = None
    ai_prompt = f"""Answer the user's question accurately and helpfully using the corporate meeting context provided below.
Current User: {active_user} ({user_role or "Staff"})
User Question: {query_scoped}
Meeting Context: {json.dumps(stored_meetings[:5], default=str)}
"""
    # Try Groq first for ultra-fast response
    answer = _synthesize_with_groq(ai_prompt)

    # Fallback to Gemini 2.5 Flash
    if not answer and settings.gemini_api_key:
        try:
            from google import genai
            client = genai.Client(api_key=settings.gemini_api_key)
            prompt = f"""You are Coco, an enterprise AI decision & meeting intelligence assistant.
Answer the user's question accurately and helpfully using the corporate meeting context provided below.
If there are specific decisions or action items, mention them clearly.
If the query is a general question, answer conversationally.

Current User: {active_user} ({user_role or "Staff"})
User Question: {query_scoped}
Meeting Knowledge Context: {json.dumps(stored_meetings[:5], default=str)}
"""
            resp = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
            if resp and resp.text:
                answer = resp.text.strip()
        except Exception as e:
            logger.warning("Gemini Coco synthesis fallback: %s", e)

    if not answer:
        answer = _format_answer_fallback(kind, results)

    return {
        "answer": answer,
        "results": results,
        "cypher": "Storage RAG Graph Query",
        "citations": citations
    }
