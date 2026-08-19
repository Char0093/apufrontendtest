import sqlite3
"""
server.py — Standalone Ask Coco Intelligence Server (ChromaDB + Groq)
"""
import os
import json
import logging
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import chromadb
from chromadb.utils import embedding_functions
from openai import OpenAI
from dotenv import load_dotenv

# Load env files — use override=True so values are always applied
_script_dir = Path(__file__).resolve().parent
_root_dir   = _script_dir.parent

for _env_candidate in [
    _root_dir / "MEETINGS" / ".env",
    _root_dir / "backend" / ".env",
    _root_dir / ".env",
    _script_dir / ".env",
]:
    if _env_candidate.exists():
        load_dotenv(_env_candidate, override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
RESULTS_DIR = _root_dir / "MEETINGS" / "results"
CHROMA_DB_PATH = _script_dir / "memory"

if GROQ_API_KEY:
    logger.info("✅ GROQ_API_KEY loaded successfully (key ends: ...%s)", GROQ_API_KEY[-6:])
    groq_client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
else:
    logger.error("❌ GROQ_API_KEY is MISSING — check backend/.env or root .env")
    groq_client = None

# Initialize ChromaDB Memory
collection = None

def init_memory():
    global collection
    logger.info("🔄 Initializing ChromaDB Memory System...")
    
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_DB_PATH))
    try:
        # Uses sentence-transformers (CPU-based)
        embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        collection = chroma_client.get_or_create_collection(
            name="meeting_memory",
            embedding_function=embedding_function
        )
        logger.info("✅ Embedding function loaded! ChromaDB initialized.")
    except Exception as e:
        logger.warning(f"⚠️ Failed to load embedding function: {e}. Falling back to default.")
        collection = chroma_client.get_or_create_collection(name="meeting_memory")

    # Load all meetings from MEETINGS/results
    load_all_meetings()

def load_all_meetings():
    global collection
    if collection is None:
        return

    # 1. Map SQLite meeting IDs to titles
    sqlite_titles = {}
    for db_path in [
        _root_dir / "backend" / "corporate_brain.db",
        _root_dir / "backend" / "app.db",
        _root_dir / "corporate_brain.db"
    ]:
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                cursor = conn.cursor()
                cursor.execute("SELECT id, title FROM meetings")
                for row in cursor.fetchall():
                    sqlite_titles[row[0]] = row[1]
                conn.close()
                break
            except Exception as e:
                logger.warning(f"Notice reading SQLite database for titles: {e}")

    # 2. Get existing loaded IDs in ChromaDB
    existing_ids = set()
    try:
        if collection.count() > 0:
            existing_results = collection.get(include=[])
            if existing_results and existing_results.get("ids"):
                existing_ids = set(existing_results["ids"])
    except Exception:
        existing_ids = set()

    total_added = 0

    # 3. Source A: Load from MEETINGS/results/
    if RESULTS_DIR.exists():
        for p in RESULTS_DIR.glob("*.json"):
            if p.name.endswith(".status.json"):
                continue
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                job_id = data.get("job_id", p.stem)
                filename = data.get("filename", "Unknown Meeting")
                
                transcript_raw = data.get("transcript", [])
                ids, documents, metadatas = [], [], []
                for idx, item in enumerate(transcript_raw):
                    doc_id = f"{job_id}_transcript_{idx:04d}"
                    if doc_id in existing_ids:
                        continue
                    ts = item.get("timestamp", "00:00:00")
                    spk = item.get("speaker", "Unknown")
                    txt = item.get("text", "")
                    ids.append(doc_id)
                    documents.append(f"[{ts}] {spk}: {txt}")
                    metadatas.append({"timestamp": ts, "speaker": spk, "source": filename, "full_text": txt})

                sum_id = f"{job_id}_summary"
                if sum_id not in existing_ids:
                    decisions = data.get("decisions", [])
                    action_items = data.get("action_items", [])
                    if decisions or action_items:
                        s_lines = [f"📋 SUMMARY FOR: {filename}"]
                        if decisions:
                            s_lines.append("\n📝 Decisions:")
                            for i, d in enumerate(decisions, 1):
                                s_lines.append(f"   {i}. {d.get('text', '')}")
                        if action_items:
                            s_lines.append("\n✅ Action Items:")
                            for i, a in enumerate(action_items, 1):
                                s_lines.append(f"   {i}. {a.get('task', '')} (Assignee: {a.get('assignee', 'Unassigned')})")
                        summary_txt = "\n".join(s_lines)
                        ids.append(sum_id)
                        documents.append(summary_txt)
                        metadatas.append({"timestamp": "00:00:00", "speaker": "System", "source": filename, "full_text": summary_txt})

                if ids:
                    collection.add(ids=ids, documents=documents, metadatas=metadatas)
                    total_added += len(ids)
            except Exception as e:
                logger.warning(f"Error loading {p}: {e}")

    # 4. Source B: Load from Corporate Brain backend storage (transcripts + summaries)
    backend_sum_dir = _root_dir / "backend" / "storage" / "summaries"
    backend_trans_dir = _root_dir / "backend" / "storage" / "transcripts"

    if backend_sum_dir.exists():
        for sum_path in backend_sum_dir.glob("*.json"):
            if sum_path.name.startswith("."):
                continue
            m_id = sum_path.stem
            meeting_title = sqlite_titles.get(m_id, f"Meeting {m_id[:8]}")
            
            ids, documents, metadatas = [], [], []

            # 4a. Load transcript lines
            trans_path = backend_trans_dir / f"{m_id}.json"
            if trans_path.exists():
                try:
                    with open(trans_path, 'r', encoding='utf-8') as f:
                        trans_data = json.load(f)
                    if isinstance(trans_data, list):
                        for idx, item in enumerate(trans_data):
                            doc_id = f"cb_{m_id}_transcript_{idx:04d}"
                            if doc_id in existing_ids:
                                continue
                            ts = item.get("timestamp", "00:00:00")
                            spk = item.get("speaker", "Unknown")
                            txt = item.get("text", "")
                            ids.append(doc_id)
                            documents.append(f"[{meeting_title} @ {ts}] {spk}: {txt}")
                            metadatas.append({"timestamp": ts, "speaker": spk, "source": meeting_title, "full_text": txt})
                except Exception as e:
                    logger.warning(f"Error loading transcript {trans_path}: {e}")

            # 4b. Load summary, decisions, and action items
            sum_doc_id = f"cb_{m_id}_summary"
            if sum_doc_id not in existing_ids:
                try:
                    with open(sum_path, 'r', encoding='utf-8') as f:
                        sum_data = json.load(f)
                    summary_lines = [f"📋 MEETING: {meeting_title}"]
                    if sum_data.get("summary"):
                        summary_lines.append(f"Overview: {sum_data.get('summary')}")
                    if sum_data.get("participants"):
                        summary_lines.append(f"Attendees: {', '.join(sum_data.get('participants', []))}")
                    if sum_data.get("decisions"):
                        summary_lines.append("\n📝 Decisions Made:")
                        for i, d in enumerate(sum_data.get("decisions", []), 1):
                            d_txt = d.get('title') or d.get('text', '')
                            summary_lines.append(f"   {i}. {d_txt} (Decided by: {d.get('speaker', 'Team')})")
                    if sum_data.get("action_items"):
                        summary_lines.append("\n✅ Action Items:")
                        for i, a in enumerate(sum_data.get("action_items", []), 1):
                            summary_lines.append(f"   {i}. {a.get('task', '')} (Assignee: {a.get('assignee', 'Unassigned')})")
                    
                    full_sum_text = "\n".join(summary_lines)
                    ids.append(sum_doc_id)
                    documents.append(full_sum_text)
                    metadatas.append({"timestamp": "00:00:00", "speaker": "System", "source": meeting_title, "full_text": full_sum_text})
                except Exception as e:
                    logger.warning(f"Error loading summary {sum_path}: {e}")

            if ids:
                try:
                    collection.add(ids=ids, documents=documents, metadatas=metadatas)
                    total_added += len(ids)
                except Exception as e:
                    logger.warning(f"Error adding meeting {m_id} to ChromaDB: {e}")

    if total_added > 0:
        logger.info(f"✅ ChromaDB Memory Synced: Added {total_added} new meeting snippets. Total memory records: {collection.count()}")

# --- HELPERS ---
MEETING_KEYWORDS = [
    'meeting', 'discuss', 'agenda', 'decision', 'action item', 'task',
    'summarize', 'summary', 'explain', 'tell', 'project', 'audit',
    'what', 'who', 'why', 'when', 'how', 'which'
]

def is_meeting_related(question: str) -> bool:
    question_lower = question.lower().strip()
    for kw in MEETING_KEYWORDS:
        if kw in question_lower:
            return True
    return len(question_lower) > 5

# --- FASTAPI APP ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    init_memory()
    yield

from fastapi.responses import FileResponse

app = FastAPI(title="Ask Coco Engine", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def serve_index():
    index_path = Path(__file__).parent / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"detail": "index.html not found"}


class ChatRequest(BaseModel):
    query: str

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    # Dynamically sync any newly uploaded meetings into ChromaDB
    try:
        load_all_meetings()
    except Exception as e:
        logger.warning(f"Notice syncing meetings on chat: {e}")
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Empty query")
    
    if not is_meeting_related(req.query):
        return {
            "answer": "🤷 I'm Coco, your meeting intelligence assistant. I can only answer questions about your meetings. Please ask me about decisions, speakers, or summaries!",
            "citations": []
        }

    if not groq_client:
        return {
            "answer": "❌ GROQ_API_KEY is missing. Please add GROQ_API_KEY to your MEETINGS/.env file and restart the server.",
            "citations": []
        }

    # Guard: if collection is empty, return friendly message immediately
    try:
        doc_count = collection.count()
    except Exception:
        doc_count = 0

    if doc_count == 0:
        return {
            "answer": "📂 No meeting recordings have been processed yet. Please run the pipeline on a meeting first, then ask me anything about it!",
            "citations": []
        }

    try:
        # Cap n_results to what's actually available (ChromaDB errors if n_results > count)
        n = min(5, doc_count)
        results = collection.query(
            query_texts=[req.query],
            n_results=n
        )
        
        context_lines = []
        citations = []
        
        if results['documents'] and results['documents'][0]:
            for i, doc in enumerate(results['documents'][0]):
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                timestamp = metadata.get('timestamp', 'Unknown')
                speaker = metadata.get('speaker', 'Unknown')
                source = metadata.get('source', 'Meeting')
                context_lines.append(f"[{source} @ {timestamp}] {speaker}: {doc}")
                citations.append({
                    "filename": source,
                    "timestamp": timestamp,
                    "speaker": speaker,
                    "excerpt": metadata.get("full_text", doc)
                })
                
        if not context_lines:
            return {
                "answer": "🤷 I couldn't find any relevant information about that in your meeting records.",
                "citations": []
            }
            
        context = "\n".join(context_lines)
        
        prompt = f"""
You are Coco, the AI assistant for Corporate Brain. You answer questions based ONLY on the meeting transcripts provided below.

**Context (from processed meetings):**
{context}

**Question:** {req.query}

**Instructions:**
1. Answer the question clearly and accurately using ONLY the context above.
2. If the context doesn't contain the answer, politely say you don't know based on the current meeting records, and you MUST prefix your response with exactly "NO_INFO: ".
3. Keep your answer professional but friendly.
"""
        response = groq_client.chat.completions.create(
            model="qwen/qwen3.6-27b",
            messages=[
                {"role": "system", "content": "You are a concise AI assistant. Do NOT output thinking steps or <think> tags. Provide ONLY the final response."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2500
        )
        
        import re
        raw_answer = response.choices[0].message.content or ""
        
        # Safely extract final answer after closing </think> or </thinking> tag if present
        if "</think>" in raw_answer.lower():
            answer = re.split(r'</think>', raw_answer, flags=re.IGNORECASE)[-1].strip()
        elif "</thinking>" in raw_answer.lower():
            answer = re.split(r'</thinking>', raw_answer, flags=re.IGNORECASE)[-1].strip()
        else:
            answer = re.sub(r'</?(?:think|thinking)>', '', raw_answer, flags=re.IGNORECASE).strip()

        # Clean any leftover tag remnants
        answer = re.sub(r'</?(?:think|thinking)>', '', answer, flags=re.IGNORECASE).strip()

        # If NO_INFO is signaled or no information could be found, wipe citations and clean prefix
        if "NO_INFO:" in answer or "don't have any information" in answer.lower() or "no information" in answer.lower() or "don't have information" in answer.lower() or "couldn't find" in answer.lower():
            answer = re.sub(r'NO_INFO:\s*', '', answer, flags=re.IGNORECASE).strip()
            citations = []
            
        return {
            "answer": answer,
            "citations": citations
        }
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
