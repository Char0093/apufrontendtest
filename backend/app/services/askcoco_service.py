"""Deterministic Ask Coco queries backed by predefined Cypher templates."""
import re
from collections.abc import Callable

from app.graph.neo4j_service import run_query


QueryBuilder = Callable[[str], tuple[str, dict]]


def _person_from_query(query: str) -> str | None:
    match = re.search(r"\bfor\s+([A-Za-z][A-Za-z .'-]+?)(?:[?.!,]|$)", query, re.IGNORECASE)
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


_TEMPLATES: tuple[tuple[tuple[str, ...], QueryBuilder], ...] = (
    (("action", "task", "todo", "commitment"), _action_items),
    (("contradiction", "conflict", "flag"), _contradictions),
    (("decision", "decide", "approved", "agreement"), _decisions),
    (("participant", "attendee", "speaker", "who"), _participants),
)


def _select_template(query: str) -> QueryBuilder:
    lowered = query.lower()
    for keywords, builder in _TEMPLATES:
        if any(keyword in lowered for keyword in keywords):
            return builder
    return _meetings


def _format_answer(results: list[dict]) -> str:
    if not results:
        return "No matching meeting records were found."

    lines = []
    for row in results[:10]:
        values = [str(value) for value in row.values() if value not in (None, "", [])]
        lines.append(" - ".join(values))
    return "\n".join(lines)


def ask(query: str) -> dict:
    """Map a natural-language question to a safe, predefined Cypher query."""
    if not query.strip():
        return {"answer": "Please ask a question.", "results": [], "cypher": "", "citations": []}

    cypher, params = _select_template(query)(query)
    try:
        results = run_query(cypher, **params)
    except Exception:
        return {
            "answer": "The meeting graph is unavailable. Start Neo4j and try again.",
            "results": [],
            "cypher": cypher,
            "citations": [],
        }

    return {
        "answer": _format_answer(results),
        "results": results,
        "cypher": cypher,
        "citations": [],
    }
