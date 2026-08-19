import hashlib
import json
import logging
from pathlib import Path
from typing import List, Dict, Optional
import numpy as np

from app.core.config import get_settings
from app.schemas.meeting_intelligence import MeetingIntelligence

logger = logging.getLogger(__name__)
settings = get_settings()

_EMBED_DIR = Path(settings.storage_path) / "embeddings"
_EMBED_DIR.mkdir(parents=True, exist_ok=True)

_genai_client = None


def _get_client():
    global _genai_client
    if _genai_client is None and settings.gemini_api_key:
        try:
            from google import genai
            _genai_client = genai.Client(api_key=settings.gemini_api_key)
        except Exception as e:
            logger.warning(f"Google GenAI Client init notice: {e}")
    return _genai_client


def _stable_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def index_meeting(meeting_id: str, filename: str, intelligence: MeetingIntelligence) -> None:
    """Fast batch indexing of meeting decisions using official Google GenAI SDK."""
    try:
        client = _get_client()
        decisions_texts = [(d.text or d.title or "").strip() for d in intelligence.decisions if (d.text or d.title or "").strip()]
        
        vectors_map = {}
        if client and decisions_texts:
            try:
                resp = client.models.embed_content(
                    model="gemini-embedding-001",
                    contents=decisions_texts,
                )
                if hasattr(resp, "embeddings") and resp.embeddings:
                    for txt, emb in zip(decisions_texts, resp.embeddings):
                        vectors_map[txt] = list(emb.values)
            except Exception as e:
                logger.warning(f"Batch embedding notice: {e}")

        records = []
        for i, d in enumerate(intelligence.decisions):
            txt = (d.text or d.title or "").strip()
            if not txt:
                continue
            records.append({
                "id": f"{meeting_id}_dec_{i}_{_stable_hash(txt)}",
                "meeting_id": meeting_id,
                "type": "decision",
                "text": txt,
                "speaker": d.speaker,
                "timestamp": d.timestamp,
                "filename": filename,
                "vector": vectors_map.get(txt, []),
            })

        file_path = _EMBED_DIR / f"{meeting_id}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(records, f)

        logger.info(f"Indexed {len(records)} decision embeddings for meeting {meeting_id}")
    except Exception as e:
        logger.warning(f"Vector indexing notice for meeting {meeting_id}: {e}")


def query_similar_decisions(decision_text: str, exclude_meeting_id: str, n_results: int = 3) -> List[Dict]:
    """Nearest-neighbor search across stored decision vectors using cosine similarity."""
    try:
        client = _get_client()
        if not client or not decision_text.strip():
            return []

        query_vec = None
        try:
            resp = client.models.embed_content(
                model="gemini-embedding-001",
                contents=[decision_text.strip()],
            )
            if hasattr(resp, "embeddings") and resp.embeddings:
                query_vec = np.array(resp.embeddings[0].values, dtype=np.float32)
        except Exception as ex:
            logger.warning(f"Query embedding notice: {ex}")
            return []

        if query_vec is None or len(query_vec) == 0:
            return []

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
