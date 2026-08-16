from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class PipelineStep(str, Enum):
    queued = "queued"
    extracting_audio = "extracting_audio"
    transcribing = "transcribing"
    aligning = "aligning"
    vision = "vision"
    analysing = "analysing"
    building_graph = "building_graph"
    saving = "saving"
    done = "done"
    error = "error"


class DecisionConfidence(str, Enum):
    firm_commitment = "firm_commitment"
    soft_agreement = "soft_agreement"
    unresolved = "unresolved"


class FlagType(str, Enum):
    contradiction = "contradiction"
    duplicate_discussion = "duplicate_discussion"
    policy_conflict = "policy_conflict"
    missing_stakeholder = "missing_stakeholder"


class TranscriptLine(BaseModel):
    timestamp: str
    speaker: str
    speaker_raw: str = ""
    text: str


class Decision(BaseModel):
    text: str = ""
    title: str = ""
    reason: str = ""
    evidence: str = ""
    confidence: DecisionConfidence
    timestamp: str
    speaker: str

    @model_validator(mode="before")
    @classmethod
    def keep_title_and_text_compatible(cls, value):
        if isinstance(value, dict):
            value = dict(value)
            value.setdefault("title", value.get("text", ""))
            value.setdefault("text", value.get("title", ""))
        return value


class ActionItem(BaseModel):
    task: str
    assignee: str
    deadline: Optional[str] = None
    priority: str = "medium"


class Flag(BaseModel):
    type: FlagType
    message: str
    severity: str = "warning"
    source_decision_text: Optional[str] = None
    contradicts_meeting_id: Optional[str] = None
    contradicts_decision_text: Optional[str] = None
    judge: str = "llm"


class KnowledgeTriple(BaseModel):
    subject: str
    predicate: str
    object: str


class MeetingAnalysis(BaseModel):
    """Structured output of the Gemini extraction stage (Task 3.1/3.2), before
    contradiction detection (Task 4.4) attaches any flags."""

    summary: str = ""
    participants: list[str] = Field(default_factory=list)
    speaker_map: dict[str, str] = Field(default_factory=dict)
    decisions: list[Decision] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    knowledge_triples: list[KnowledgeTriple] = Field(default_factory=list)


class MeetingIntelligence(BaseModel):
    """Full processed result for a meeting — what /meeting/{id}/summary and
    /meeting/{id}/transcript are built from."""

    meeting_id: str
    duration: str = "—"
    summary: str = ""
    participants: list[str] = Field(default_factory=list)
    speaker_map: dict[str, str] = Field(default_factory=dict)
    transcript: list[TranscriptLine] = Field(default_factory=list)
    decisions: list[Decision] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
    flags: list[Flag] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    knowledge_triples: list[KnowledgeTriple] = Field(default_factory=list)
