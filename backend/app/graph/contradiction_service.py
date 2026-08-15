"""Contradiction detection (Task 4.4, real path): embed each new decision,
find similar past decisions from OTHER meetings via ChromaDB, then ask
Gemini to judge whether they actually conflict (not just topically similar).
On a real contradiction, returns a Flag for the Phase 5.3 summary response.

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


def _judge_contradiction(new_text: str, past_text: str) -> Optional[str]:
    """Ask Gemini/Agnes whether two similar decisions actually contradict.
    Returns a short reason if they do, None if they don't or the call fails
    (fail closed — no flag rather than a fabricated one)."""
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
            return data.get("reason", "Flagged as a likely contradiction.")
        return None
    except Exception as e:
        logger.warning(f"Contradiction judge call failed: {e}")
        return None


def check_decisions(meeting_id: str, decisions: list[Decision]) -> list[Flag]:
    """For each new decision, look for a genuine contradiction among past
    decisions from other meetings (their embeddings must already be indexed
    via embedding_service.index_meeting for prior meetings). Returns any
    Flags found; does not mutate the input list."""
    flags: list[Flag] = []

    for decision in decisions:
        matches = embedding_service.query_similar_decisions(
            decision.text, exclude_meeting_id=meeting_id, n_results=3
        )
        for match in matches:
            if match["distance"] > _SIMILARITY_DISTANCE_THRESHOLD:
                continue

            reason = _judge_contradiction(decision.text, match["text"])
            if not reason:
                continue

            flags.append(Flag(
                type=FlagType.contradiction,
                message=reason,
                severity="warning",
                source_decision_text=decision.text,
                contradicts_meeting_id=match["meeting_id"],
                contradicts_decision_text=match["text"],
            ))
            logger.info(f"[{meeting_id}] Contradiction flagged against {match['meeting_id']}: {reason}")
            break  # one flag per new decision is enough for the demo

    return flags
