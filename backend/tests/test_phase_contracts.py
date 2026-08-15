from app.core.config import Settings
from app.schemas.meeting_intelligence import Decision, MeetingAnalysis
from app.services import askcoco_service
from app.services.gemini_service import parse_analysis_response


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
