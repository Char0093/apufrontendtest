"""Gemini intelligence extraction (Phase 3, Task 3.1/3.2/3.3). Ported from
MEETINGS/pipeline.py's _call_agnes_api(), run_gemini_analysis(), and
_fallback_analysis().

Deviation from the source: the original prompt asked Gemini to flag
contradictions against a hardcoded two-sentence "historical context" string.
That was a demo shortcut, not a real comparison against stored decisions —
real contradiction detection is app.graph.contradiction_service (Task 4.4,
embeddings + a dedicated Gemini judge call), so this module only extracts
decisions and action items, not flags.
"""
import json
import logging
import re
import time
import urllib.request
from typing import List, Optional

from app.core.config import get_settings
from app.services import vertex_ai_service
from app.schemas.meeting_intelligence import (
    ActionItem,
    Decision,
    DecisionConfidence,
    Flag,
    FlagType,
    MeetingAnalysis,
    MeetingIntelligence,
    TranscriptLine,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def parse_analysis_response(raw: str) -> MeetingAnalysis:
    """Repair common JSON formatting mistakes, then validate the full schema."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        repaired = re.sub(r",\s*([}\]])", r"\1", cleaned)
        data = json.loads(repaired)
    return MeetingAnalysis.model_validate(data)


def call_agnes_api(messages: list, model: str = "agnes-2.5-pro") -> str:
    """OpenAI-compatible chat completion call to Agnes AI, with 429 backoff.
    Shared by gemini_service (text fallback) and vision_service (vision
    fallback)."""
    url = f"{settings.agnes_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.agnes_api_key}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages}
    data_bytes = json.dumps(payload).encode("utf-8")

    for attempt in range(2):
        try:
            req = urllib.request.Request(url, data=data_bytes, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                return res["choices"][0]["message"]["content"]
        except Exception as e:
            err_str = str(e)
            if ("429" in err_str or "rate" in err_str.lower()) and attempt < 3:
                logger.warning(f"Agnes AI rate limited (429). Retrying in 2.5s (attempt {attempt + 1}/4)...")
                time.sleep(2.5)
                continue
            raise


def run_gemini_analysis(transcript_text: str, detected_names: Optional[List[str]] = None) -> dict:
    """Extract speaker mapping, decisions, and action items.
    PRIMARY: Gemini 2.5 Flash (Super-fast, high accuracy).
    FALLBACK: Agnes AI (agnes-2.5-pro)."""
    names_str = ", ".join(detected_names) if detected_names else "None detected from video frames"

    prompt = f"""
You are the AI engine for 'Corporate Brain', an organizational intelligence platform.

**PART 1 — INFER & MAP SPEAKER NAMES**
The transcript currently has speaker IDs like SPEAKER_01, SPEAKER_02, etc.
The following participant names were DETECTED from video nameplates/tiles by Vision AI:
[{names_str}]

Analyze the conversation carefully to determine each speaker's real identity:
1. Match each SPEAKER_XX to one of the detected participant names above.
2. If there are more speakers in the transcript than detected names, analyze how speakers greet or address each other in dialogue (e.g., "Thanks John", "Hey Sarah, what do you think?", "Good point Duncan") to infer their real names.
3. Make sure EVERY unique SPEAKER_XX is assigned a real person's name (e.g. 'Yap En Yu', 'Simla', 'David Lee', 'Sarah Chen'). NEVER use generic job titles, roles, or placeholders like 'Meeting Lead', 'Marketing Rep', 'Operations Rep', 'Host', or 'Participant'.
4. If a person's name cannot be found in the video or dialogue, infer their real name from the first name spoken or use their nameplate.
4. The 'participants' list in your JSON output MUST include ALL people who spoke or attended the meeting.

**PART 2 — EXTRACT INTELLIGENCE**
From the transcript, extract a concise summary, decisions, action items,
risks, and factual knowledge triples.

**CRITICAL RULES FOR ACTION ITEMS & DECISIONS:**
1. `task`: MUST be a short, clear, action-oriented summary title (maximum 8–15 words, e.g., "Log in to portal and complete initial post"). NEVER copy long verbatim transcript speech, conversational script, or verbal filler like "Oh, it's really easy to be honest..."!
2. `title`: MUST be a clear, concise decision title (maximum 8–15 words).
3. Decision confidence must be one of "firm_commitment" | "soft_agreement" | "unresolved".

**Meeting Transcript:**
{transcript_text}

**Return ONLY valid JSON** with this exact structure:
{{
  "summary": "Concise meeting summary",
  "participants": ["Real Name 1", "Real Name 2"],
  "speaker_map": {{"SPEAKER_01": "Real Name 1", "SPEAKER_02": "Real Name 2"}},
  "decisions": [
    {{
      "title": "Decision title",
      "reason": "Why this decision was made",
      "evidence": "Transcript evidence supporting the decision",
      "confidence": "firm_commitment",
      "timestamp": "00:00:14",
      "speaker": "Real Name 1"
    }}
  ],
  "action_items": [
    {{
      "task": "Task description",
      "assignee": "Real Name 2",
      "deadline": "2026-08-20",
      "priority": "high"
    }}
  ],
  "risks": ["A concrete risk raised in the meeting"],
  "knowledge_triples": [
    {{"subject": "Project Alpha", "predicate": "USES_VENDOR", "object": "Provider X"}}
  ]
}}
"""

    try:
        # 1. PRIMARY: Gemini Flash (using new fresh API key)
        if vertex_ai_service.is_configured(settings):
            try:
                from google.genai import types
                client = vertex_ai_service.get_client(settings)
                for model_name in [vertex_ai_service.model_name(settings)]:
                    for attempt in range(3):
                        try:
                            print(f"[GEMINI AI] >> Running intelligence extraction with {model_name} (attempt {attempt+1}/3)...", flush=True)
                            response = client.models.generate_content(
                                model=model_name,
                                contents=prompt,
                                config=types.GenerateContentConfig(response_mime_type="application/json"),
                            )
                            if response.text:
                                parsed = parse_analysis_response(response.text).model_dump()
                                print(f"[GEMINI AI] >> Extracted {len(parsed.get('decisions', []))} decisions and {len(parsed.get('action_items', []))} action items via Gemini!", flush=True)
                                logger.info(f"Successfully extracted intelligence with {model_name}")
                                return parsed
                        except Exception as gemini_ex:
                            err_s = str(gemini_ex)
                            if ("503" in err_s or "demand" in err_s.lower() or "429" in err_s) and attempt < 2:
                                print(f"[GEMINI AI] >> 503 temporary spike on {model_name}, retrying in 2.5s...", flush=True)
                                time.sleep(2.5)
                                continue
                            logger.warning(f"Model {model_name} notice: {gemini_ex}")
                            break
            except Exception as g_err:
                logger.warning(f"Gemini setup notice: {g_err}")

        # 2. FALLBACK: Agnes AI (agnes-2.5-pro)
        if settings.agnes_api_key:
            try:
                print("[AGNES AI] >> Running fallback extraction with Agnes AI (agnes-2.5-pro)...", flush=True)
                logger.info("Running Agnes AI fallback analysis...")
                messages = [{"role": "user", "content": prompt}]
                raw = call_agnes_api(messages, model="agnes-2.0-flash")
                if raw:
                    parsed = parse_analysis_response(raw).model_dump()
                    print(f"[AGNES AI] >> Extracted {len(parsed.get('decisions', []))} decisions via Agnes AI!", flush=True)
                    return parsed
            except Exception as agnes_err:
                logger.warning(f"Agnes AI analysis failed: {agnes_err}")

        raise ValueError("No meeting-intelligence API returned a valid response")
    except Exception as e:
        logger.warning(f"AI analysis failed: {e}. Using fallback extraction.")
        return fallback_analysis(transcript_text, detected_names)


def _clean_task_description(txt: str) -> str:
    """Sanitize task description to a clean 8-15 word action title."""
    cleaned = txt.strip()
    cleaned = re.sub(r'^(i will|i\'ll|we will|we\'ll|please|can you|let\'s)\s+', '', cleaned, flags=re.IGNORECASE)
    words = cleaned.split()
    if len(words) > 15:
        cleaned = " ".join(words[:12]) + "..."
    return cleaned.capitalize() if cleaned else "Follow up on discussion item"

def fallback_analysis(transcript_text: str, detected_names: Optional[List[str]] = None) -> dict:
    """Keyword-heuristic extraction when Gemini/Agnes both fail (rate limits,
    quota, network)."""
    participants = list(set(detected_names)) if detected_names else ["Speaker"]
    decisions = []
    action_items = []

    for line in transcript_text.split("\n"):
        if not line.strip():
            continue
        ts, spk, txt = "00:00:00", "Speaker", line
        if line.startswith("[") and "]" in line:
            parts = line.split("]", 1)
            ts = parts[0].replace("[", "").strip()
            rest = parts[1].strip()
            if ":" in rest:
                spk_parts = rest.split(":", 1)
                spk = spk_parts[0].strip()
                txt = spk_parts[1].strip()

        l_lower = txt.lower()
        cleaned_task = _clean_task_description(txt)
        if any(w in l_lower for w in ["decide", "agree", "confirm", "approve", "settle", "must", "wise", "compulsory"]):
            decisions.append({"text": cleaned_task, "confidence": "firm_commitment", "timestamp": ts, "speaker": spk})
        elif any(w in l_lower for w in ["action", "task", "todo", "post", "send", "submit", "check", "need to"]):
            action_items.append({"task": cleaned_task, "assignee": spk, "deadline": "End of week", "priority": "high"})

    return {
        "summary": "Meeting transcript processed with deterministic fallback extraction.",
        "participants": participants,
        "speaker_map": {},
        "decisions": decisions[:5],
        "action_items": action_items[:5],
        "risks": [],
        "knowledge_triples": [],
    }


# ── Demo mode — canned scenario, zero API calls ────────────────────────────
# Mirrors MEETINGS/pipeline.py's _demo_pipeline(). Used when settings.demo_mode
# is true so the full pipeline can be verified/demoed with no API keys and no
# network calls. The contradiction flag here is pre-baked (not produced by
# contradiction_service) — meeting_tasks.py wires it to a seeded prior
# decision via graph_builder.seed_demo_history() so a real CONTRADICTS edge
# still appears in Neo4j.
DEMO_SEED_MEETING_ID = "demo-seed-meeting"
DEMO_SEED_DECISION_TEXT = "Freeze all new vendor onboarding until Q4."


def demo_meeting_intelligence(meeting_id: str) -> MeetingIntelligence:
    transcript = [
        TranscriptLine(timestamp="00:00:08", speaker="Sarah Park", speaker_raw="SPEAKER_01", text="Good morning everyone. Let's start with the vendor evaluation."),
        TranscriptLine(timestamp="00:01:22", speaker="Tom Wright", speaker_raw="SPEAKER_02", text="I've reviewed all three providers. Provider X leads on cost and SLA."),
        TranscriptLine(timestamp="00:03:10", speaker="Alex Chen", speaker_raw="SPEAKER_03", text="What's the cost saving over the full contract period?"),
        TranscriptLine(timestamp="00:03:45", speaker="Tom Wright", speaker_raw="SPEAKER_02", text="22% over 36 months — roughly $340,000 total savings."),
        TranscriptLine(timestamp="00:05:20", speaker="Diana Ross", speaker_raw="SPEAKER_04", text="Are there integration risks for Project Alpha's Q4 deadline?"),
        TranscriptLine(timestamp="00:06:30", speaker="Tom Wright", speaker_raw="SPEAKER_02", text="6-week migration window. A security audit is the main precondition."),
        TranscriptLine(timestamp="00:08:15", speaker="Diana Ross", speaker_raw="SPEAKER_04", text="Did we formally lift the vendor freeze from the May all-hands?"),
        TranscriptLine(timestamp="00:09:40", speaker="Sarah Park", speaker_raw="SPEAKER_01", text="That freeze was a guideline. I'm comfortable proceeding. Decision made."),
        TranscriptLine(timestamp="00:11:05", speaker="Sarah Park", speaker_raw="SPEAKER_01", text="Official decision: switch to Provider X, effective Q4 2026. Tom, own the audit."),
        TranscriptLine(timestamp="00:11:30", speaker="Tom Wright", speaker_raw="SPEAKER_02", text="Confirmed. I'll target audit completion by August 20th."),
        TranscriptLine(timestamp="00:13:45", speaker="Alex Chen", speaker_raw="SPEAKER_03", text="The transition adds ~15% to Project Alpha's budget. I need that approved."),
        TranscriptLine(timestamp="00:14:55", speaker="Sarah Park", speaker_raw="SPEAKER_01", text="Approved in principle. Bring formal numbers to finance Thursday."),
    ]
    decisions = [
        Decision(text="Switch primary vendor to Provider X, effective Q4 2026", confidence=DecisionConfidence.firm_commitment, timestamp="00:11:05", speaker="Sarah Park"),
        Decision(text="Increase Project Alpha budget by 15% for vendor transition", confidence=DecisionConfidence.soft_agreement, timestamp="00:13:45", speaker="Alex Chen"),
        Decision(text="Security audit of Provider X is mandatory before contract signing", confidence=DecisionConfidence.firm_commitment, timestamp="00:06:30", speaker="Tom Wright"),
    ]
    action_items = [
        ActionItem(task="Complete security audit of Provider X", assignee="Tom Wright", deadline="2026-08-20", priority="high"),
        ActionItem(task="Submit 15% budget increase to finance committee", assignee="Alex Chen", deadline="2026-08-15", priority="high"),
        ActionItem(task="Begin vendor procurement negotiations with Provider X", assignee="Sarah Park", deadline="2026-09-01", priority="high"),
        ActionItem(task="Set up bi-weekly transition steering committee", assignee="Diana Ross", deadline=None, priority="medium"),
    ]
    flags = [
        Flag(
            type=FlagType.contradiction,
            message="Provider X decision may conflict with the vendor freeze agreed at the May 3rd All-Hands meeting.",
            severity="warning",
            source_decision_text="Switch primary vendor to Provider X, effective Q4 2026",
            contradicts_meeting_id=DEMO_SEED_MEETING_ID,
            contradicts_decision_text=DEMO_SEED_DECISION_TEXT,
        ),
    ]

    return MeetingIntelligence(
        meeting_id=meeting_id,
        duration="00:15:20",
        summary="The team selected Provider X for Q4, subject to a security audit and finance approval for the transition budget.",
        participants=["Sarah Park", "Tom Wright", "Alex Chen", "Diana Ross"],
        speaker_map={
            "SPEAKER_01": "Sarah Park",
            "SPEAKER_02": "Tom Wright",
            "SPEAKER_03": "Alex Chen",
            "SPEAKER_04": "Diana Ross",
        },
        transcript=transcript,
        decisions=decisions,
        action_items=action_items,
        flags=flags,
        risks=[
            "Provider X must pass a security audit before contract signing.",
            "The transition may increase Project Alpha's budget by 15%.",
        ],
        knowledge_triples=[
            {"subject": "Project Alpha", "predicate": "USES_VENDOR", "object": "Provider X"},
            {"subject": "Tom Wright", "predicate": "OWNS", "object": "Provider X security audit"},
        ],
    )
