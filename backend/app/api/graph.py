import logging
from typing import Dict, List
from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.core.logger import get_logger
from app.graph import neo4j_service
from app.services.storage_service import StorageService

router = APIRouter()
logger = get_logger(__name__)
settings = get_settings()
storage = StorageService()


def _drop_dangling_links(nodes: dict[str, dict], links: list[dict]) -> list[dict]:
    valid_ids = set(nodes.keys())
    return [l for l in links if l.get("source") in valid_ids and l.get("target") in valid_ids]


def _build_fallback_meeting_graph(meeting_id: str) -> dict:
    summary_data = storage.get_summary(meeting_id) or {}
    nodes: dict[str, dict] = {}
    links: list[dict] = []
    meeting_node_id = f"meeting:{meeting_id}"

    duration_str = summary_data.get("duration", "30m")
    nodes[meeting_node_id] = {
        "id": meeting_node_id,
        "label": f"Meeting Sync ({duration_str})",
        "type": "Meeting",
    }

    participants = summary_data.get("participants", [])
    for person in participants:
        if person:
            pid = f"person:{person}"
            nodes[pid] = {"id": pid, "label": person, "type": "Person"}
            links.append({"source": pid, "target": meeting_node_id, "type": "PARTICIPATED_IN"})

    decisions = summary_data.get("decisions", [])
    for i, d in enumerate(decisions):
        d_text = d.get("text") or d.get("title") or f"Decision {i+1}"
        d_speaker = d.get("speaker")
        did = f"decision:{meeting_id}_{i}"
        nodes[did] = {"id": did, "label": str(d_text)[:60], "type": "Decision"}
        links.append({"source": did, "target": meeting_node_id, "type": "MADE_IN"})
        if d_speaker and d_speaker in participants:
            links.append({"source": did, "target": f"person:{d_speaker}", "type": "MADE_BY"})

    action_items = summary_data.get("action_items", [])
    for j, a in enumerate(action_items):
        a_task = a.get("task") or f"Action {j+1}"
        a_assignee = a.get("assignee")
        aid = f"action:{meeting_id}_{j}"
        nodes[aid] = {"id": aid, "label": str(a_task)[:60], "type": "ActionItem"}
        links.append({"source": aid, "target": meeting_node_id, "type": "MADE_IN"})
        if a_assignee:
            pid = f"person:{a_assignee}"
            if pid not in nodes:
                nodes[pid] = {"id": pid, "label": a_assignee, "type": "Person"}
            links.append({"source": aid, "target": pid, "type": "ASSIGNED_TO"})

    return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}


@router.get("/meeting/{meeting_id}/graph-data")
def get_meeting_graph_data(meeting_id: str) -> dict:
    if not settings.neo4j_uri or "localhost" in settings.neo4j_uri or "127.0.0.1" in settings.neo4j_uri:
        return _build_fallback_meeting_graph(meeting_id)

    try:
        meeting_rows = neo4j_service.run_query(
            "MATCH (m:Meeting {id: $id}) RETURN m.id AS id, m.title AS title", id=meeting_id
        )
        if not meeting_rows:
            return _build_fallback_meeting_graph(meeting_id)

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
            if row.get("speaker"):
                pid = f"person:{row['speaker']}"
                if pid in nodes:
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
            if row.get("assignee"):
                pid = f"person:{row['assignee']}"
                if pid in nodes:
                    links.append({"source": aid, "target": pid, "type": "ASSIGNED_TO"})

        return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}
    except Exception as e:
        logger.warning(f"Neo4j offline for meeting {meeting_id}, using JSON fallback: {e}")
        return _build_fallback_meeting_graph(meeting_id)


@router.get("/graph")
def get_global_graph_data() -> dict:
    if not settings.neo4j_uri or "localhost" in settings.neo4j_uri or "127.0.0.1" in settings.neo4j_uri:
        # Build global aggregate graph across stored summaries
        nodes: dict[str, dict] = {}
        links: list[dict] = []
        try:
            summaries_dir = storage.base_path / "summaries"
            if summaries_dir.exists():
                for sf in summaries_dir.glob("*.json"):
                    mid = sf.stem
                    fg = _build_fallback_meeting_graph(mid)
                    for n in fg.get("nodes", []):
                        nodes[n["id"]] = n
                    for l in fg.get("links", []):
                        links.append(l)
        except Exception:
            pass
        return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}

    try:
        nodes: dict[str, dict] = {}
        links: list[dict] = []

        for row in neo4j_service.run_query("MATCH (m:Meeting) RETURN m.id AS id, m.title AS title"):
            mid = f"meeting:{row['id']}"
            nodes[mid] = {"id": mid, "label": row["title"] or row["id"], "type": "Meeting"}

        for row in neo4j_service.run_query(
            "MATCH (p:Person)-[:PARTICIPATED_IN]->(m:Meeting) RETURN p.name AS person, m.id AS meeting"
        ):
            pid = f"person:{row['person']}"
            mid = f"meeting:{row['meeting']}"
            nodes[pid] = {"id": pid, "label": row["person"], "type": "Person"}
            links.append({"source": pid, "target": mid, "type": "PARTICIPATED_IN"})

        for row in neo4j_service.run_query(
            """MATCH (d:Decision)-[:MADE_IN]->(m:Meeting)
               OPTIONAL MATCH (d)-[:MADE_BY]->(p:Person)
               RETURN d.id AS id, d.text AS text, m.id AS meeting, p.name AS speaker"""
        ):
            did = f"decision:{row['id']}"
            nodes[did] = {"id": did, "label": row["text"], "type": "Decision"}
            links.append({"source": did, "target": f"meeting:{row['meeting']}", "type": "MADE_IN"})
            if row.get("speaker"):
                pid = f"person:{row['speaker']}"
                if pid in nodes:
                    links.append({"source": did, "target": pid, "type": "MADE_BY"})

        for row in neo4j_service.run_query(
            """MATCH (a:ActionItem)-[:MADE_IN]->(m:Meeting)
               OPTIONAL MATCH (a)-[:ASSIGNED_TO]->(p:Person)
               RETURN a.id AS id, a.task AS task, m.id AS meeting, p.name AS assignee"""
        ):
            aid = f"action:{row['id']}"
            nodes[aid] = {"id": aid, "label": row["task"], "type": "ActionItem"}
            links.append({"source": aid, "target": f"meeting:{row['meeting']}", "type": "MADE_IN"})
            if row.get("assignee"):
                pid = f"person:{row['assignee']}"
                if pid in nodes:
                    links.append({"source": aid, "target": pid, "type": "ASSIGNED_TO"})

        return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}
    except Exception as e:
        logger.warning(f"Neo4j offline for global graph: {e}")
        return {"nodes": [], "links": []}
