"""ChromaDB + sentence-transformers embedding service. Two collections:
- meeting_snippets: transcript lines + summary blob, feeds Ask Coco RAG
  (Task 5.5, app.services.askcoco_service)
- decisions: one embedding per extracted decision, feeds contradiction
  detection (Task 4.4, app.graph.contradiction_service)

Adapted from ASK COCO/server.py's init_memory()/load_all_meetings(), which
read straight from MEETINGS/results/*.json — this version is called directly
from the Celery pipeline with already-in-memory data instead of re-reading
from disk, and is a reusable service instead of module-level globals.
"""
import hashlib
import logging

import chromadb
from chromadb.utils import embedding_functions

from app.core.config import get_settings
from app.schemas.meeting_intelligence import MeetingIntelligence

logger = logging.getLogger(__name__)
settings = get_settings()

_client = None
_embedding_fn = None
_snippets_collection = None
_decisions_collection = None


def _get_client():
    global _client, _embedding_fn
    if _client is None:
        _client = chromadb.PersistentClient(path=settings.chroma_path)
        try:
            _embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="all-MiniLM-L6-v2"
            )
        except Exception as e:
            logger.warning(f"Failed to load embedding function: {e}. Using ChromaDB default.")
            _embedding_fn = None
    return _client


def _get_collection(name: str):
    client = _get_client()
    if _embedding_fn:
        return client.get_or_create_collection(name=name, embedding_function=_embedding_fn)
    return client.get_or_create_collection(name=name)


def get_snippets_collection():
    global _snippets_collection
    if _snippets_collection is None:
        _snippets_collection = _get_collection("meeting_snippets")
    return _snippets_collection


def get_decisions_collection():
    global _decisions_collection
    if _decisions_collection is None:
        _decisions_collection = _get_collection("decisions")
    return _decisions_collection


def _stable_hash(text: str) -> str:
    """Deterministic short id — Python's built-in hash() is randomized per
    process (PYTHONHASHSEED), which would duplicate entries in Chroma on
    every worker restart."""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def index_meeting(meeting_id: str, filename: str, intelligence: MeetingIntelligence) -> None:
    """Embed this meeting's transcript + summary into meeting_snippets, and
    each decision into decisions. Upsert, so re-processing a meeting updates
    in place rather than duplicating."""
    snippets = get_snippets_collection()

    ids, documents, metadatas = [], [], []
    for idx, line in enumerate(intelligence.transcript):
        full_line = f"[{line.timestamp}] {line.speaker}: {line.text}"
        ids.append(f"{meeting_id}_transcript_{idx:04d}")
        documents.append(full_line)
        metadatas.append({
            "timestamp": line.timestamp,
            "speaker": line.speaker,
            "source": filename,
            "meeting_id": meeting_id,
            "full_text": line.text,
        })

    if ids:
        snippets.upsert(ids=ids, documents=documents, metadatas=metadatas)

    if intelligence.decisions or intelligence.action_items:
        summary_lines = [f"SUMMARY FOR: {filename}"]
        if intelligence.decisions:
            summary_lines.append("Decisions:")
            summary_lines += [f"- {d.text}" for d in intelligence.decisions]
        if intelligence.action_items:
            summary_lines.append("Action Items:")
            summary_lines += [f"- {a.task} (Assignee: {a.assignee})" for a in intelligence.action_items]
        summary_text = "\n".join(summary_lines)
        snippets.upsert(
            ids=[f"{meeting_id}_summary"],
            documents=[summary_text],
            metadatas=[{
                "timestamp": "00:00:00",
                "speaker": "System",
                "source": filename,
                "meeting_id": meeting_id,
                "full_text": summary_text,
            }],
        )

    decisions = get_decisions_collection()
    for decision in intelligence.decisions:
        decision_id = f"{meeting_id}_{_stable_hash(decision.text)}"
        decisions.upsert(
            ids=[decision_id],
            documents=[decision.text],
            metadatas=[{
                "meeting_id": meeting_id,
                "text": decision.text,
                "timestamp": decision.timestamp,
            }],
        )


def query_snippets(question: str, n_results: int = 5) -> dict:
    """(Task 5.5) Semantic search over transcript snippets + summaries for
    Ask Coco's RAG context."""
    collection = get_snippets_collection()
    if collection.count() == 0:
        return {"documents": [[]], "metadatas": [[]]}
    return collection.query(query_texts=[question], n_results=min(n_results, collection.count()))


def query_similar_decisions(decision_text: str, exclude_meeting_id: str, n_results: int = 3) -> list[dict]:
    """(Task 4.4) Nearest-neighbor past decisions from OTHER meetings."""
    collection = get_decisions_collection()
    if collection.count() == 0:
        return []

    results = collection.query(
        query_texts=[decision_text],
        n_results=min(n_results + 3, collection.count()),
    )

    matches = []
    if results["documents"] and results["documents"][0]:
        for doc, meta, dist in zip(
            results["documents"][0], results["metadatas"][0], results["distances"][0]
        ):
            if meta.get("meeting_id") == exclude_meeting_id:
                continue
            matches.append({"text": doc, "meeting_id": meta.get("meeting_id"), "distance": dist})
            if len(matches) >= n_results:
                break
    return matches

def delete_meeting(meeting_id: str) -> None:
    """Delete vector embeddings for meeting_id from meeting_snippets and decisions collections."""
    try:
        snippets = get_snippets_collection()
        snippets.delete(where={"meeting_id": meeting_id})
    except Exception as e:
        logger.warning(f"ChromaDB snippets delete for meeting {meeting_id} failed: {e}")

    try:
        decisions = get_decisions_collection()
        decisions.delete(where={"meeting_id": meeting_id})
    except Exception as e:
        logger.warning(f"ChromaDB decisions delete for meeting {meeting_id} failed: {e}")