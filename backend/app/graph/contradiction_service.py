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
