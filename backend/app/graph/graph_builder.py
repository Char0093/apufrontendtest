"""Graph schema (Task 4.2) + builder (Task 4.3).

Nodes: Meeting, Person, Decision, ActionItem, Project. Policy/Document are
schema-only per the plan doc — not created here since none of this
pipeline's flag types populate a policy conflict yet.

Relationships: PARTICIPATED_IN (Person->Meeting), MADE_IN (Decision/
ActionItem->Meeting), MADE_BY (Decision->Person), ASSIGNED_TO (ActionItem->
Person), RELATES_TO (Meeting/Decision->Project), CONTRADICTS (Decision->
Decision, written by contradiction_service), VIOLATES (Decision->Policy,
schema-only for now, not written anywhere).
"""
import logging
import uuid

from app.graph.neo4j_service import run_query
from app.schemas.meeting_intelligence import MeetingIntelligence

logger = logging.getLogger(__name__)


def ensure_constraints() -> None:
    """Uniqueness constraints — idempotent, safe to call on every startup."""
    statements = [
        "CREATE CONSTRAINT meeting_id IF NOT EXISTS FOR (m:Meeting) REQUIRE m.id IS UNIQUE",
        "CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE",
        "CREATE CONSTRAINT decision_id IF NOT EXISTS FOR (d:Decision) REQUIRE d.id IS UNIQUE",
        "CREATE CONSTRAINT action_item_id IF NOT EXISTS FOR (a:ActionItem) REQUIRE a.id IS UNIQUE",
        "CREATE CONSTRAINT project_name IF NOT EXISTS FOR (pr:Project) REQUIRE pr.name IS UNIQUE",
    ]
    for stmt in statements:
        run_query(stmt)


def decision_node_id(meeting_id: str, decision_text: str) -> str:
    return _stable_id(meeting_id, "decision", decision_text)


def build_from_meeting(
    meeting_id: str,
    title: str,
    project: str | None,
    intelligence: MeetingIntelligence,
) -> None:
    """MERGE this meeting's Meeting/Person/Decision/ActionItem nodes and
    relationships into the graph. Uses deterministic ids so re-processing the
    same meeting updates in place instead of duplicating."""
    run_query("MERGE (m:Meeting {id: $id}) SET m.title = $title", id=meeting_id, title=title)

    if project:
        run_query(
            "MERGE (pr:Project {name: $project}) "
            "MERGE (m:Meeting {id: $meeting_id}) "
            "MERGE (m)-[:RELATES_TO]->(pr)",
            project=project,
            meeting_id=meeting_id,
        )

    for person in intelligence.participants:
        run_query(
            "MERGE (p:Person {name: $name}) "
            "MERGE (m:Meeting {id: $meeting_id}) "
            "MERGE (p)-[:PARTICIPATED_IN]->(m)",
            name=person,
            meeting_id=meeting_id,
        )

    for decision in intelligence.decisions:
        decision_id = decision_node_id(meeting_id, decision.text)
        run_query(
            "MERGE (d:Decision {id: $id}) "
            "SET d.text = $text, d.confidence = $confidence, d.timestamp = $timestamp "
            "MERGE (m:Meeting {id: $meeting_id}) "
            "MERGE (d)-[:MADE_IN]->(m) "
            "MERGE (p:Person {name: $speaker}) "
            "MERGE (d)-[:MADE_BY]->(p)",
            id=decision_id,
            text=decision.text,
            confidence=decision.confidence.value,
            timestamp=decision.timestamp,
            meeting_id=meeting_id,
            speaker=decision.speaker,
        )
        if project:
            run_query(
                "MATCH (d:Decision {id: $id}) MERGE (pr:Project {name: $project}) MERGE (d)-[:RELATES_TO]->(pr)",
                id=decision_id,
                project=project,
            )

    for item in intelligence.action_items:
        item_id = _stable_id(meeting_id, "action", item.task)
        run_query(
            "MERGE (a:ActionItem {id: $id}) "
            "SET a.task = $task, a.deadline = $deadline, a.priority = $priority "
            "MERGE (m:Meeting {id: $meeting_id}) "
            "MERGE (a)-[:MADE_IN]->(m) "
            "MERGE (p:Person {name: $assignee}) "
            "MERGE (a)-[:ASSIGNED_TO]->(p)",
            id=item_id,
            task=item.task,
            deadline=item.deadline,
            priority=item.priority,
            meeting_id=meeting_id,
            assignee=item.assignee,
        )

    logger.info(
        f"[{meeting_id}] Graph updated — {len(intelligence.participants)} people, "
        f"{len(intelligence.decisions)} decisions, {len(intelligence.action_items)} action items"
    )


def write_contradiction(from_decision_id: str, to_decision_id: str, message: str) -> None:
    """(Task 4.4) Write a CONTRADICTS edge between two Decision nodes."""
    run_query(
        "MATCH (a:Decision {id: $from_id}), (b:Decision {id: $to_id}) "
        "MERGE (a)-[r:CONTRADICTS]->(b) SET r.message = $message",
        from_id=from_decision_id,
        to_id=to_decision_id,
        message=message,
    )


def seed_demo_history() -> str:
    """Idempotently create the synthetic prior meeting(s) that the canned
    demo-mode contradiction flag (gemini_service.demo_meeting_intelligence)
    points at, so DEMO_MODE=true still produces a real, queryable CONTRADICTS
    edge without any live API calls. Returns the seeded decision's node id
    (unchanged — same id the contradiction flag has always pointed at).

    Also seeds one earlier meeting (Task 7.3: a demo dataset that's a real
    multi-meeting story, not one isolated contradiction) connected to the
    Q2 seed via a shared attendee, so the graph shows Q1 -> Q2 -> the new
    meeting rather than just two floating nodes."""
    from app.services.gemini_service import DEMO_SEED_DECISION_TEXT, DEMO_SEED_MEETING_ID

    origin_meeting_id = "demo-seed-meeting-origin"
    origin_decision_id = decision_node_id(
        origin_meeting_id, "Flag vendor concentration risk ahead of Q3 renewal cycle."
    )
    run_query(
        "MERGE (m:Meeting {id: $meeting_id}) SET m.title = 'Q1 Vendor Risk Review (seed)' "
        "MERGE (d:Decision {id: $decision_id}) "
        "SET d.text = $text, d.confidence = 'soft_agreement', d.timestamp = '00:00:00' "
        "MERGE (d)-[:MADE_IN]->(m) "
        "MERGE (p:Person {name: 'Sarah Park'}) "
        "MERGE (p)-[:PARTICIPATED_IN]->(m) "
        "MERGE (d)-[:MADE_BY]->(p)",
        meeting_id=origin_meeting_id,
        decision_id=origin_decision_id,
        text="Flag vendor concentration risk ahead of Q3 renewal cycle.",
    )

    seed_decision_id = decision_node_id(DEMO_SEED_MEETING_ID, DEMO_SEED_DECISION_TEXT)
    run_query(
        "MERGE (m:Meeting {id: $meeting_id}) SET m.title = 'Q2 All-Hands (seed)' "
        "MERGE (d:Decision {id: $decision_id}) "
        "SET d.text = $text, d.confidence = 'firm_commitment', d.timestamp = '00:00:00' "
        "MERGE (d)-[:MADE_IN]->(m) "
        "MERGE (p:Person {name: 'Sarah Park'}) "
        "MERGE (p)-[:PARTICIPATED_IN]->(m) "
        "MERGE (d)-[:MADE_BY]->(p)",
        meeting_id=DEMO_SEED_MEETING_ID,
        decision_id=seed_decision_id,
        text=DEMO_SEED_DECISION_TEXT,
    )
    return seed_decision_id


_LABEL_TARGETS = {
    "Meeting": "id",
    "Decision": "id",
    "ActionItem": "id",
    "Person": "name",
    "Project": "name",
}


def set_display_name(node_type: str, identifier: str, display_name: str | None) -> None:
    """Set (or, with display_name=None, clear) a node's display-only label
    override. `identifier` is the node's real id (Meeting/Decision/
    ActionItem) or real name (Person/Project) — never the override itself.
    node_type is checked against a fixed allowlist before being interpolated
    into the Cypher label position, so this can't be used to inject an
    arbitrary label/query."""
    key = _LABEL_TARGETS.get(node_type)
    if key is None:
        raise ValueError(f"Unknown node type: {node_type}")
    run_query(
        f"MATCH (n:{node_type} {{{key}: $identifier}}) SET n.display_name = $display_name",
        identifier=identifier,
        display_name=display_name,
    )


def meetings_referencing_person(name: str) -> set[str]:
    """Every meeting id where this Person participated, made a decision, or
    was assigned an action item — used to propagate a Person rename beyond
    the graph node itself into the stored per-meeting transcript/summary
    records that Decisions/Action Items/Transcript actually render from
    (see api/graph.py's set_node_label)."""
    rows = run_query(
        """MATCH (p:Person {name: $name})
           OPTIONAL MATCH (p)-[:PARTICIPATED_IN]->(m1:Meeting)
           OPTIONAL MATCH (p)<-[:MADE_BY]-(:Decision)-[:MADE_IN]->(m2:Meeting)
           OPTIONAL MATCH (p)<-[:ASSIGNED_TO]-(:ActionItem)-[:MADE_IN]->(m3:Meeting)
           RETURN collect(DISTINCT m1.id) + collect(DISTINCT m2.id) + collect(DISTINCT m3.id) AS ids""",
        name=name,
    )
    if not rows:
        return set()
    return {mid for mid in rows[0]["ids"] if mid}


def _stable_id(meeting_id: str, kind: str, text: str) -> str:
    """Deterministic id so re-processing the same meeting MERGEs instead of
    duplicating nodes."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"corporate-brain://{meeting_id}/{kind}/{text}"))

def delete_meeting_nodes(meeting_id: str) -> None:
    """Delete all nodes (Meeting, Decision, ActionItem) associated with a meeting ID
    from Neo4j, and clean up any orphaned Person or Project nodes."""
    try:
        # Delete Decisions attached to this meeting
        run_query(
            "MATCH (m:Meeting {id: $meeting_id})<-[:MADE_IN]-(d:Decision) DETACH DELETE d",
            meeting_id=meeting_id,
        )
        # Delete ActionItems attached to this meeting
        run_query(
            "MATCH (m:Meeting {id: $meeting_id})<-[:MADE_IN]-(a:ActionItem) DETACH DELETE a",
            meeting_id=meeting_id,
        )
        # Delete the Meeting node itself
        run_query(
            "MATCH (m:Meeting {id: $meeting_id}) DETACH DELETE m",
            meeting_id=meeting_id,
        )
        # Clean up orphan Person nodes that have no relationships left
        run_query("MATCH (p:Person) WHERE NOT (p)--() DELETE p")
        # Clean up orphan Project nodes that have no relationships left
        run_query("MATCH (pr:Project) WHERE NOT (pr)--() DELETE pr")
        logger.info(f"Deleted Neo4j graph nodes for meeting {meeting_id}")
    except Exception as exc:
        logger.warning(f"Neo4j node deletion for meeting {meeting_id} failed: {exc}")