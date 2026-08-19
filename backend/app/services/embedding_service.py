import hashlib
import json
import logging
import os
from pathlib import Path
from typing import List, Dict, Optional
import numpy as np

from app.core.config import get_settings
from app.schemas.meeting_intelligence import MeetingIntelligence

logger = logging.getLogger(__name__)
settings = get_settings()

_EMBED_DIR = Path(settings.storage_path) / "embeddings"
_EMBED_DIR.mkdir(parents=True, exist_ok=True)


def _get_embed_fn():
    """Returns Google GenAI Cloud Embedding function (0MB RAM)."""
    if settings.gemini_api_key:
        try:
            os.environ["GEMINI_API_KEY"] = settings.gemini_api_key
            from chromadb.utils.embedding_functions import GoogleGenaiEmbeddingFunction
            return GoogleGenaiEmbeddingFunction(
                model_name="gemini-embedding-001",
                api_key_env_var="GEMINI_API_KEY",
            )
        except Exception as e:
            logger.warning(f"Google GenAI Embedding init notice: {e}")
    return None


def _stable_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def index_meeting(meeting_id: str, filename: str, intelligence: MeetingIntelligence) -> None:
    """Index meeting decisions and summary into pure-Python vector store (100% cloud stable)."""
    try:
        embed_fn = _get_embed_fn()
        records = []

        # 1. Embed decisions
        for i, d in enumerate(intelligence.decisions):
            txt = (d.text or d.title or "").strip()
            if not txt:
                continue
            
            vec = []
            if embed_fn:
                try:
                    res = embed_fn([txt])
                    if res and len(res) > 0:
                        vec = res[0].tolist() if hasattr(res[0], "tolist") else list(res[0])
                except Exception as ex:
                    logger.warning(f"Embedding generate notice for decision '{txt}': {ex}")

            records.append({
                "id": f"{meeting_id}_dec_{i}_{_stable_hash(txt)}",
                "meeting_id": meeting_id,
                "type": "decision",
                "text": txt,
                "speaker": d.speaker,
                "timestamp": d.timestamp,
                "filename": filename,
                "vector": vec,
            })

        # 2. Save records to persistent disk file
        file_path = _EMBED_DIR / f"{meeting_id}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(records, f)

        logger.info(f"Indexed {len(records)} decision embeddings for meeting {meeting_id}")
    except Exception as e:
        logger.warning(f"Vector indexing skipped for meeting {meeting_id}: {e}")


def query_similar_decisions(decision_text: str, exclude_meeting_id: str, n_results: int = 3) -> List[Dict]:
    """Nearest-neighbor search across stored decision vectors using cosine similarity."""
    try:
        embed_fn = _get_embed_fn()
        if not embed_fn:
            return []

        query_vec = None
        try:
            res = embed_fn([decision_text])
            if res and len(res) > 0:
                query_vec = np.array(res[0], dtype=np.float32)
        except Exception as ex:
            logger.warning(f"Query embedding notice: {ex}")
            return []

        if query_vec is None or len(query_vec) == 0:
            return []

        # Scan all stored meeting embedding files
        candidates = []
        norm_q = np.linalg.norm(query_vec)
        if norm_q == 0:
            return []

        for fpath in _EMBED_DIR.glob("*.json"):
            if fpath.stem == exclude_meeting_id:
                continue
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    recs = json.load(f)
                for r in recs:
                    v = r.get("vector")
                    if v and len(v) == len(query_vec):
                        cand_v = np.array(v, dtype=np.float32)
                        norm_c = np.linalg.norm(cand_v)
                        if norm_c > 0:
                            # Cosine distance = 1 - cosine similarity
                            sim = float(np.dot(query_vec, cand_v) / (norm_q * norm_c))
                            dist = max(0.0, 1.0 - sim)
                            candidates.append({
                                "text": r["text"],
                                "meeting_id": r["meeting_id"],
                                "distance": dist,
                            })
            except Exception:
                continue

        candidates.sort(key=lambda x: x["distance"])
        return candidates[:n_results]
    except Exception as e:
        logger.warning(f"query_similar_decisions notice: {e}")
        return []


def delete_meeting(meeting_id: str) -> None:
    """Delete vector file for meeting_id."""
    try:
        fpath = _EMBED_DIR / f"{meeting_id}.json"
        if fpath.exists():
            fpath.unlink()
    except Exception as e:
        logger.warning(f"Delete meeting vector file notice: {e}")
