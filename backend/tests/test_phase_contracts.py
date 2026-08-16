from unittest.mock import MagicMock

from app.core.config import Settings
from app.models.meeting import Meeting
from app.schemas.meeting_intelligence import Decision, MeetingAnalysis
from app.services import askcoco_service
from app.services.gemini_service import parse_analysis_response
from app.services.storage_service import StorageService
from app.tasks import meeting_tasks


def test_demo_settings_do_not_require_external_api_keys():
    settings = Settings(
        _env_file=None,
        neo4j_password="test-password",
        gemini_api_key="",
        demo_mode=True,
    )

    assert settings.demo_mode is True
    assert settings.deepgram_api_key == ""


def test_meeting_analysis_accepts_complete_intelligence_contract():
    analysis = MeetingAnalysis.model_validate(
        {
            "summary": "The team approved the vendor migration.",
            "participants": ["Sarah Park"],
            "decisions": [
                {
                    "title": "Move to Provider X",
                    "reason": "Lower cost and a stronger SLA",
                    "evidence": "Provider X saves 22% over 36 months",
                    "confidence": "firm_commitment",
                    "timestamp": "00:11:05",
                    "speaker": "Sarah Park",
                }
            ],
            "action_items": [],
            "risks": ["Migration depends on a security audit"],
            "knowledge_triples": [
                {
                    "subject": "Project Alpha",
                    "predicate": "USES_VENDOR",
                    "object": "Provider X",
                }
            ],
        }
    )

    assert analysis.decisions[0].text == "Move to Provider X"
    assert analysis.decisions[0].reason == "Lower cost and a stronger SLA"
    assert analysis.knowledge_triples[0].object == "Provider X"


def test_legacy_decision_text_remains_supported():
    decision = Decision.model_validate(
        {
            "text": "Approve the revised budget",
            "confidence": "soft_agreement",
            "timestamp": "00:03:00",
            "speaker": "Alex Chen",
        }
    )

    assert decision.title == "Approve the revised budget"


def test_gemini_response_is_repaired_and_validated():
    analysis = parse_analysis_response(
        """```json
        {
          "summary": "Budget approved",
          "decisions": [{
            "title": "Approve budget",
            "confidence": "firm_commitment",
            "timestamp": "00:01:00",
            "speaker": "Sarah Park",
          }],
          "action_items": [],
          "risks": [],
          "knowledge_triples": [],
        }
        ```"""
    )

    assert analysis.summary == "Budget approved"
    assert analysis.decisions[0].title == "Approve budget"


def test_ask_coco_uses_predefined_action_item_query(monkeypatch):
    captured = {}

    def fake_run_query(cypher: str, **params):
        captured["cypher"] = cypher
        captured["params"] = params
        return [
            {
                "task": "Complete the security audit",
                "assignee": "Sarah Park",
                "deadline": "2026-08-20",
                "meeting": "Vendor Review",
            }
        ]

    monkeypatch.setattr(askcoco_service, "run_query", fake_run_query)

    result = askcoco_service.ask("Find action items for Sarah Park")

    assert "ASSIGNED_TO" in captured["cypher"]
    assert captured["params"]["person"] == "Sarah Park"
    assert result["results"][0]["task"] == "Complete the security audit"
    assert result["cypher"] == captured["cypher"]
    assert "Complete the security audit" in result["answer"]


def test_storage_round_trips_live_segments(tmp_path):
    storage = StorageService(base_path=str(tmp_path))
    segments = [{"speaker": "Alex", "identity": "alex-123", "text": "hello", "timestamp": "00:00:01", "start": 1.2}]

    storage.save_live_segments("mtg-live-1", segments)

    assert storage.get_live_segments("mtg-live-1") == segments


def test_analyze_transcript_produces_intelligence_without_a_video_file(monkeypatch):
    """Live sessions have no video file to run Vision on — _analyze_transcript
    must work correctly with name_timestamps/all_detected_names omitted."""
    monkeypatch.setattr(
        meeting_tasks.gemini_service,
        "run_gemini_analysis",
        lambda transcript_text, names: {
            "summary": "Quick sync",
            "participants": ["Alex Chen"],
            "speaker_map": {},
            "decisions": [],
            "action_items": [],
            "risks": [],
            "knowledge_triples": [],
        },
    )
    monkeypatch.setattr(meeting_tasks.embedding_service, "index_meeting", lambda *a, **k: None)
    monkeypatch.setattr(meeting_tasks.contradiction_service, "check_decisions", lambda *a, **k: [])

    meeting = Meeting(id="mtg-live-2", title="Live: team-sync", file_path=None)
    segments = [{"speaker": "Alex Chen", "identity": "alex-123", "text": "Let's sync quickly", "timestamp": "00:00:05", "start": 5.0}]

    intelligence = meeting_tasks._analyze_transcript(meeting, segments, on_progress=lambda *a: None)

    assert intelligence.meeting_id == "mtg-live-2"
    assert intelligence.summary == "Quick sync"
    assert intelligence.duration == "00:00:05"


def test_process_live_meeting_task_reads_segments_and_saves_graph(monkeypatch, tmp_path):
    # No id= passed: this suite runs against a real, non-isolated SQLite
    # database (see conftest.py — no per-test rollback fixture), so a
    # hardcoded id can collide with a row a previous run left behind (e.g.
    # a test that fails after its own commit but before finishing). Meeting
    # already defaults id to a fresh uuid4 — use that instead of fighting it.
    storage = StorageService(base_path=str(tmp_path))
    monkeypatch.setattr(meeting_tasks, "storage", storage)

    db = meeting_tasks.SessionLocal()
    meeting = Meeting(title="Live: team-sync", file_path=None, status="pending")
    db.add(meeting)
    db.commit()
    meeting_id = meeting.id
    db.close()

    try:
        storage.save_live_segments(meeting_id, [{"speaker": "Alex", "identity": "a", "text": "hi", "timestamp": "00:00:01", "start": 1.0}])

        fake_intelligence = MagicMock(decisions=[], action_items=[], flags=[])
        monkeypatch.setattr(meeting_tasks, "_analyze_transcript", lambda meeting, segments, on_progress: fake_intelligence)
        save_and_graph_calls = []
        monkeypatch.setattr(meeting_tasks, "_save_and_graph", lambda meeting, intelligence: save_and_graph_calls.append((meeting.id, intelligence)))

        meeting_tasks.process_live_meeting_task.run(meeting_id)

        assert save_and_graph_calls == [(meeting_id, fake_intelligence)]
        db = meeting_tasks.SessionLocal()
        updated = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        assert updated.status == "completed"
        db.close()
    finally:
        db = meeting_tasks.SessionLocal()
        db.query(Meeting).filter(Meeting.id == meeting_id).delete()
        db.commit()
        db.close()
