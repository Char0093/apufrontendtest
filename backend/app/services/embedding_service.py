import hashlib
import logging
import os
from typing import Optional

import chromadb
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
        try:
            _client = chromadb.PersistentClient(path=settings.chroma_path)
        except Exception as e:
            logger.warning(f"ChromaDB client init notice: {e}")
            _client = chromadb.Client()

        # Cloud API Embeddings (0MB RAM): Verified working with Google GenAI API
        try:
            if settings.gemini_api_key:
                os.environ["GEMINI_API_KEY"] = settings.gemini_api_key
                from chromadb.utils.embedding_functions import GoogleGenaiEmbeddingFunction
                _embedding_fn = GoogleGenaiEmbeddingFunction(
                    model_name="gemini-embedding-001",
                    api_key_env_var="GEMINI_API_KEY",
                )
                logger.info("Initialized Google GenAI Cloud Embedding function (0MB RAM)")
            else:
                _embedding_fn = None
        except Exception as e:
            logger.warning(f"Embedding function init notice: {e}")
            _embedding_fn = None
    return _client


def _get_collection(name: str):
    client = _get_client()
    try:
        if _embedding_fn:
            return client.get_or_create_collection(name=name, embedding_function=_embedding_fn)
        return client.get_or_create_collection(name=name)
    except Exception as e:
        logger.warning(f"Collection {name} fallback init: {e}")
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
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def index_meeting(meeting_id: str, filename: str, intelligence: MeetingIntelligence) -> None:
    """Index meeting transcript snippets and decisions into ChromaDB using cloud embeddings."""
    try:
        snippets = get_snippets_collection()
        docs, metas, ids = [], [], []

        if intelligence.summary:
            docs.append(f"Meeting Summary ({filename}): {intelligence.summary}")
            metas.append({"meeting_id": meeting_id, "type": "summary", "filename": filename})
            ids.append(f"{meeting_id}_summary")

        for i, line in enumerate(intelligence.transcript):
            docs.append(f"[{line.timestamp}] {line.speaker}: {line.text}")
            metas.append({
                "meeting_id": meeting_id,
                "type": "transcript",
                "speaker": line.speaker,
                "timestamp": line.timestamp,
                "filename": filename,
            })
            ids.append(f"{meeting_id}_line_{i}_{_stable_hash(line.text)}")

        if docs:
            snippets.upsert(documents=docs, metadatas=metas, ids=ids)

        decisions = get_decisions_collection()
        d_docs, d_metas, d_ids = [], [], []
        for i, d in enumerate(intelligence.decisions):
            text_val = d.text or d.title or ""
            d_docs.append(text_val)
            d_metas.append({
                "meeting_id": meeting_id,
                "confidence": d.confidence.value if hasattr(d.confidence, "value") else str(d.confidence),
                "timestamp": d.timestamp,
                "speaker": d.speaker,
                "filename": filename,
            })
            d_ids.append(f"{meeting_id}_decision_{i}_{_stable_hash(text_val)}")

        if d_docs:
            decisions.upsert(documents=d_docs, metadatas=d_metas, ids=d_ids)

        logger.info(f"Indexed meeting {meeting_id} ({len(docs)} snippets, {len(d_docs)} decisions)")
    except Exception as e:
        logger.warning(f"Vector indexing notice for meeting {meeting_id}: {e}")


def query_similar_decisions(decision_text: str, exclude_meeting_id: str, n_results: int = 3) -> list[dict]:
    """Nearest-neighbor past decisions from OTHER meetings for contradiction detection."""
    try:
        collection = get_decisions_collection()
        if collection.count() == 0:
            return []

        results = collection.query(
            query_texts=[decision_text],
            n_results=min(n_results + 3, collection.count()),
        )

        matches = []
        if results.get("documents") and results["documents"][0]:
            for doc, meta, dist in zip(
                results["documents"][0], results["metadatas"][0], results.get("distances", [[0.0]*len(results["documents"][0])])[0]
            ):
                if meta and meta.get("meeting_id") == exclude_meeting_id:
                    continue
                matches.append({
                    "text": doc,
                    "meeting_id": meta.get("meeting_id") if meta else "",
                    "distance": dist if dist is not None else 0.5
                })
                if len(matches) >= n_results:
                    break
        return matches
    except Exception as e:
        logger.warning(f"query_similar_decisions notice: {e}")
        return []


def delete_meeting(meeting_id: str) -> None:
    """Delete vector embeddings for meeting_id from ChromaDB."""
    try:
        snippets = get_snippets_collection()
        snippets.delete(where={"meeting_id": meeting_id})
    except Exception as e:
        logger.warning(f"ChromaDB snippets delete for meeting {meeting_id} notice: {e}")

    try:
        decisions = get_decisions_collection()
        decisions.delete(where={"meeting_id": meeting_id})
    except Exception as e:
        logger.warning(f"ChromaDB decisions delete for meeting {meeting_id} notice: {e}")
