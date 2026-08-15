"""GET /meeting/{id}/graph-data (Task 5.4) — {nodes, links} for
react-force-graph, sourced from Neo4j. CONTRADICTS links get
isContradiction: true so the frontend can render them distinctly (Task 6.6).
"""
from fastapi import APIRouter, HTTPException

from app.core.logger import get_logger
from app.graph import neo4j_service

router = APIRouter()
logger = get_logger(__name__)


def _drop_dangling_links(nodes: dict[str, dict], links: list[dict]) -> list[dict]:
    """Safety net for react-force-graph-2d's d3-force layer, which throws
    "node not found" if a link's source/target id has no matching node.
    Each block above issues its own separate Neo4j query/transaction, so a
    node written concurrently (e.g. by a background meeting-processing task)
    between two of those queries can otherwise be referenced by a link
    without ever being added to `nodes` — drop such links rather than
    shipping a payload the frontend can't render."""
    valid_ids = nodes.keys()
    kept = [l for l in links if l["source"] in valid_ids and l["target"] in valid_ids]
    if len(kept) != len(links):
        logger.warning(
            f"Dropped {len(links) - len(kept)} graph link(s) referencing a node "
            f"missing from this response's nodes[]"
        )
    return kept


@router.get("/meeting/{meeting_id}/graph-data")
def get_meeting_graph_data(meeting_id: str) -> dict:
    meeting_rows = neo4j_service.run_query(
        "MATCH (m:Meeting {id: $id}) RETURN m.id AS id, m.title AS title", id=meeting_id
    )
    if not meeting_rows:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found in graph")

    nodes: dict[str, dict] = {}
    links: list[dict] = []
    meeting_node_id = f"meeting:{meeting_id}"
    nodes[meeting_node_id] = {
        "id": meeting_node_id,
        "label": meeting_rows[0]["title"] or meeting_id,
        "type": "Meeting",
    }

    for row in neo4j_service.run_query(
        "MATCH (p:Person)-[:PARTICIPATED_IN]->(m:Meeting {id: $id}) RETURN p.name AS name",
        id=meeting_id,
    ):
        pid = f"person:{row['name']}"
        nodes[pid] = {"id": pid, "label": row["name"], "type": "Person"}
        links.append({"source": pid, "target": meeting_node_id, "type": "PARTICIPATED_IN"})

    for row in neo4j_service.run_query(
        """MATCH (d:Decision)-[:MADE_IN]->(m:Meeting {id: $id})
           OPTIONAL MATCH (d)-[:MADE_BY]->(p:Person)
           RETURN d.id AS id, d.text AS text, p.name AS speaker""",
        id=meeting_id,
    ):
        did = f"decision:{row['id']}"
        nodes[did] = {"id": did, "label": row["text"], "type": "Decision"}
        links.append({"source": did, "target": meeting_node_id, "type": "MADE_IN"})
        if row["speaker"]:
            pid = f"person:{row['speaker']}"
            nodes.setdefault(pid, {"id": pid, "label": row["speaker"], "type": "Person"})
            links.append({"source": did, "target": pid, "type": "MADE_BY"})

    for row in neo4j_service.run_query(
        """MATCH (a:ActionItem)-[:MADE_IN]->(m:Meeting {id: $id})
           OPTIONAL MATCH (a)-[:ASSIGNED_TO]->(p:Person)
           RETURN a.id AS id, a.task AS task, p.name AS assignee""",
        id=meeting_id,
    ):
        aid = f"action:{row['id']}"
        nodes[aid] = {"id": aid, "label": row["task"], "type": "ActionItem"}
        links.append({"source": aid, "target": meeting_node_id, "type": "MADE_IN"})
        if row["assignee"]:
            pid = f"person:{row['assignee']}"
            nodes.setdefault(pid, {"id": pid, "label": row["assignee"], "type": "Person"})
            links.append({"source": aid, "target": pid, "type": "ASSIGNED_TO"})

    for row in neo4j_service.run_query(
        "MATCH (m:Meeting {id: $id})-[:RELATES_TO]->(pr:Project) RETURN pr.name AS name",
        id=meeting_id,
    ):
        prid = f"project:{row['name']}"
        nodes[prid] = {"id": prid, "label": row["name"], "type": "Project"}
        links.append({"source": meeting_node_id, "target": prid, "type": "RELATES_TO"})

    for row in neo4j_service.run_query(
        """MATCH (d:Decision)-[:MADE_IN]->(:Meeting {id: $id})
           MATCH (d)-[:RELATES_TO]->(pr:Project)
           RETURN d.id AS decision_id, d.text AS decision_text, pr.name AS name""",
        id=meeting_id,
    ):
        did = f"decision:{row['decision_id']}"
        prid = f"project:{row['name']}"
        # Same rationale as the CONTRADICTS block below: don't rely on the
        # decisions loop above having already run for this same decision.
        nodes.setdefault(did, {"id": did, "label": row["decision_text"], "type": "Decision"})
        nodes.setdefault(prid, {"id": prid, "label": row["name"], "type": "Project"})
        links.append({"source": did, "target": prid, "type": "RELATES_TO"})

    for row in neo4j_service.run_query(
        """MATCH (d:Decision)-[:MADE_IN]->(:Meeting {id: $id})
           MATCH (d)-[c:CONTRADICTS]->(other:Decision)
           RETURN d.id AS from_id, other.id AS to_id, other.text AS to_text, c.message AS message""",
        id=meeting_id,
    ):
        from_did = f"decision:{row['from_id']}"
        to_did = f"decision:{row['to_id']}"
        # `other` is the decision this one contradicts — by design that's
        # often a decision made in a *different* meeting, so it won't
        # already be in `nodes` from the meeting-scoped loop above.
        nodes.setdefault(to_did, {"id": to_did, "label": row["to_text"], "type": "Decision"})
        links.append({
            "source": from_did,
            "target": to_did,
            "type": "CONTRADICTS",
            "isContradiction": True,
            "message": row["message"],
        })

    return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}


@router.get("/graph")
def get_global_graph_data() -> dict:
    """Whole-organization knowledge graph (Task 6.6's 'Memory Graph' page) —
    every meeting/person/decision/action item/contradiction at once, not
    scoped to a single meeting."""
    nodes: dict[str, dict] = {}
    links: list[dict] = []

    for row in neo4j_service.run_query("MATCH (m:Meeting) RETURN m.id AS id, m.title AS title"):
        mid = f"meeting:{row['id']}"
        nodes[mid] = {"id": mid, "label": row["title"] or row["id"], "type": "Meeting"}

    for row in neo4j_service.run_query(
        "MATCH (p:Person)-[:PARTICIPATED_IN]->(m:Meeting) RETURN p.name AS name, m.id AS meeting_id"
    ):
        pid = f"person:{row['name']}"
        nodes.setdefault(pid, {"id": pid, "label": row["name"], "type": "Person"})
        links.append({"source": pid, "target": f"meeting:{row['meeting_id']}", "type": "PARTICIPATED_IN"})

    for row in neo4j_service.run_query(
        """MATCH (d:Decision)-[:MADE_IN]->(m:Meeting)
           OPTIONAL MATCH (d)-[:MADE_BY]->(p:Person)
           RETURN d.id AS id, d.text AS text, m.id AS meeting_id, p.name AS speaker"""
    ):
        did = f"decision:{row['id']}"
        nodes[did] = {"id": did, "label": row["text"], "type": "Decision"}
        links.append({"source": did, "target": f"meeting:{row['meeting_id']}", "type": "MADE_IN"})
        if row["speaker"]:
            pid = f"person:{row['speaker']}"
            nodes.setdefault(pid, {"id": pid, "label": row["speaker"], "type": "Person"})
            links.append({"source": did, "target": pid, "type": "MADE_BY"})

    for row in neo4j_service.run_query(
        """MATCH (a:ActionItem)-[:MADE_IN]->(m:Meeting)
           OPTIONAL MATCH (a)-[:ASSIGNED_TO]->(p:Person)
           RETURN a.id AS id, a.task AS task, m.id AS meeting_id, p.name AS assignee"""
    ):
        aid = f"action:{row['id']}"
        nodes[aid] = {"id": aid, "label": row["task"], "type": "ActionItem"}
        links.append({"source": aid, "target": f"meeting:{row['meeting_id']}", "type": "MADE_IN"})
        if row["assignee"]:
            pid = f"person:{row['assignee']}"
            nodes.setdefault(pid, {"id": pid, "label": row["assignee"], "type": "Person"})
            links.append({"source": aid, "target": pid, "type": "ASSIGNED_TO"})

    for row in neo4j_service.run_query(
        "MATCH (m:Meeting)-[:RELATES_TO]->(pr:Project) RETURN m.id AS meeting_id, pr.name AS name"
    ):
        prid = f"project:{row['name']}"
        nodes.setdefault(prid, {"id": prid, "label": row["name"], "type": "Project"})
        links.append({"source": f"meeting:{row['meeting_id']}", "target": prid, "type": "RELATES_TO"})

    for row in neo4j_service.run_query(
        "MATCH (d:Decision)-[:RELATES_TO]->(pr:Project) "
        "RETURN d.id AS decision_id, d.text AS decision_text, pr.name AS name"
    ):
        did = f"decision:{row['decision_id']}"
        prid = f"project:{row['name']}"
        # Same rationale as the CONTRADICTS block below: this decision may
        # not have been present in the earlier, separately-queried decisions
        # loop if it was written concurrently with this request.
        nodes.setdefault(did, {"id": did, "label": row["decision_text"], "type": "Decision"})
        nodes.setdefault(prid, {"id": prid, "label": row["name"], "type": "Project"})
        links.append({"source": did, "target": prid, "type": "RELATES_TO"})

    for row in neo4j_service.run_query(
        """MATCH (d:Decision)-[c:CONTRADICTS]->(other:Decision)
           RETURN d.id AS from_id, d.text AS from_text, other.id AS to_id,
                  other.text AS to_text, c.message AS message"""
    ):
        from_did = f"decision:{row['from_id']}"
        to_did = f"decision:{row['to_id']}"
        # Both ends are populated directly from this query rather than
        # relying on the decisions loop above: that loop and this one are
        # separate Neo4j transactions (see neo4j_service.run_query), so a
        # decision written concurrently between the two — e.g. by a
        # background meeting-processing task — would otherwise show up in a
        # CONTRADICTS link without ever being added to `nodes`.
        nodes.setdefault(from_did, {"id": from_did, "label": row["from_text"], "type": "Decision"})
        nodes.setdefault(to_did, {"id": to_did, "label": row["to_text"], "type": "Decision"})
        links.append({
            "source": from_did,
            "target": to_did,
            "type": "CONTRADICTS",
            "isContradiction": True,
            "message": row["message"],
        })

    return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}
