from app.core.config import Settings
from app.graph import contradiction_service
from app.schemas.meeting_intelligence import Decision, DecisionConfidence, Flag, FlagType


def _decision(text: str) -> Decision:
    return Decision(text=text, confidence=DecisionConfidence.firm_commitment, timestamp="00:00:00", speaker="Alex")


def test_check_decisions_still_flags_via_check_text(monkeypatch):
    """Regression: check_decisions()'s existing behavior must survive the
    check_text() extraction unchanged."""
    monkeypatch.setattr(
        contradiction_service,
        "check_text",
        lambda text, exclude_meeting_id: Flag(type=FlagType.contradiction, message="conflict", judge="llm"),
    )

    flags = contradiction_service.check_decisions("mtg-2", [_decision("Approve the vendor increase")])

    assert len(flags) == 1
    assert flags[0].message == "conflict"


def test_check_text_returns_none_when_nothing_similar(monkeypatch):
    monkeypatch.setattr(contradiction_service.embedding_service, "query_similar_decisions", lambda *a, **k: [])

    assert contradiction_service.check_text("Approve the budget", exclude_meeting_id="mtg-1") is None


def test_check_text_skips_matches_beyond_distance_threshold(monkeypatch):
    monkeypatch.setattr(
        contradiction_service.embedding_service,
        "query_similar_decisions",
        lambda *a, **k: [{"text": "unrelated", "meeting_id": "mtg-0", "distance": 0.9}],
    )
    called = {"judge": False}

    def fake_judge(*a, **k):
        called["judge"] = True
        return "should not run"

    monkeypatch.setattr(contradiction_service, "_judge_contradiction", fake_judge)

    assert contradiction_service.check_text("Approve the budget", exclude_meeting_id="mtg-1") is None
    assert called["judge"] is False


def test_demo_safe_judge_fallback_flags_opposing_terms(monkeypatch):
    """Neither key configured — the flagship live-suggestion moment must not
    silently no-op in a keyless demo."""
    monkeypatch.setattr(
        contradiction_service,
        "settings",
        Settings(_env_file=None, neo4j_password="x", gemini_api_key="", agnes_api_key=""),
    )
    # gemini_available() reads genai_client's own module-level settings
    # (cached from the real environment at import time), not the settings
    # object patched above — so forcing the keyless path also means forcing
    # this directly, independent of whatever Gemini/Vertex credentials
    # happen to be configured on the machine running the test.
    monkeypatch.setattr(contradiction_service, "gemini_available", lambda: False)
    monkeypatch.setattr(
        contradiction_service.embedding_service,
        "query_similar_decisions",
        lambda *a, **k: [{"text": "Freeze all vendor spending", "meeting_id": "mtg-0", "distance": 0.1}],
    )

    flag = contradiction_service.check_text("Approve a budget increase for the vendor", exclude_meeting_id="mtg-1")

    assert flag is not None
    assert flag.judge == "keyword_fallback"
    assert flag.contradicts_meeting_id == "mtg-0"


def test_llm_judge_flag_defaults_to_llm(monkeypatch):
    monkeypatch.setattr(
        contradiction_service.embedding_service,
        "query_similar_decisions",
        lambda *a, **k: [{"text": "Freeze all vendor spending", "meeting_id": "mtg-0", "distance": 0.1}],
    )
    monkeypatch.setattr(contradiction_service, "_judge_contradiction", lambda *a, **k: ("Direct conflict", "llm"))

    flag = contradiction_service.check_text("Approve a budget increase", exclude_meeting_id="mtg-1")

    assert flag is not None
    assert flag.judge == "llm"
