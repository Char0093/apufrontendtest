import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_employee, require_access
from app.core.config import get_settings
from app.database.session import get_db
from app.graph import graph_builder, neo4j_service
from app.models.employee import Employee, MeetingParticipant
from app.services.storage_service import StorageService

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()
storage = StorageService()


class SetNodeLabelRequest(BaseModel):
    node_type: str
    identifier: str
    display_name: str | None = None


@router.patch("/graph/node-label")
def set_node_label(payload: SetNodeLabelRequest) -> dict:
    """display_name=None (or omitted) clears the override, reverting to the
    node's real name/title/text/task.

    Neo4j failures are converted to an HTTPException (rather than left to
    propagate as a raw exception) so the response still passes back through
    CORSMiddleware — an uncaught exception is handled by Starlette's
    outermost ServerErrorMiddleware, which sits *outside* CORSMiddleware and
    so its response never gets CORS headers, making the browser report a
    generic "Failed to fetch" instead of a readable error."""
    try:
        graph_builder.set_display_name(payload.node_type, payload.identifier, payload.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.warning(f"Could not save node label: {exc}")
        raise HTTPException(status_code=503, detail="Could not reach the graph database — try again shortly.")

    # A Person rename should show up everywhere that name is quoted — a
    # decision's speaker, an action item's assignee, a transcript line —
    # not just the graph node. Without this, e.g. Dashboard's "My Action
    # Tasks" (which matches assignee text against the logged-in employee's
    # real name) would never surface a task still filed under an old
    # nickname/typo/AI-transcribed spelling. Best-effort: a failure here
    # doesn't roll back the graph rename that already succeeded above.
    if payload.node_type == "Person" and payload.display_name:
        try:
            for meeting_id in graph_builder.meetings_referencing_person(payload.identifier):
                _rename_person_in_storage(meeting_id, payload.identifier, payload.display_name)
        except Exception as exc:
            logger.warning(f"Could not propagate person rename into stored meeting records: {exc}")
    return {"ok": True}


def _rename_person_in_storage(meeting_id: str, old_name: str, new_name: str) -> None:
    """Case-insensitive exact-match rename of old_name -> new_name across
    one meeting's stored summary (participants, decision speakers, action
    item assignees) and transcript (per-line speakers)."""
    old_lower = old_name.strip().lower()

    summary = storage.get_summary(meeting_id)
    if summary:
        changed = False
        for i, p in enumerate(summary.get("participants") or []):
            if isinstance(p, str) and p.strip().lower() == old_lower:
                summary["participants"][i] = new_name
                changed = True
        for d in summary.get("decisions") or []:
            if isinstance(d.get("speaker"), str) and d["speaker"].strip().lower() == old_lower:
                d["speaker"] = new_name
                changed = True
        for a in summary.get("action_items") or []:
            if isinstance(a.get("assignee"), str) and a["assignee"].strip().lower() == old_lower:
                a["assignee"] = new_name
                changed = True
        if changed:
            storage.save_summary(meeting_id, summary)

    transcript = storage.get_transcript(meeting_id)
    if transcript:
        lines = transcript.get("transcript")
        changed = False
        if isinstance(lines, list):
            for line in lines:
                if isinstance(line, dict) and isinstance(line.get("speaker"), str) and line["speaker"].strip().lower() == old_lower:
                    line["speaker"] = new_name
                    changed = True
        if changed:
            storage.save_transcript(meeting_id, transcript)


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
            if row.get("assignee"):
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
               MATCH (d)-[c:CONTRADICTS]->(other:Decision)
               RETURN d.id AS from_id, other.id AS to_id, other.text AS to_text, c.message AS message""",
            id=meeting_id,
        ):
            from_did = f"decision:{row['from_id']}"
            to_did = f"decision:{row['to_id']}"
            nodes.setdefault(to_did, {"id": to_did, "label": row["to_text"], "type": "Decision"})
            links.append({
                "source": from_did,
                "target": to_did,
                "type": "CONTRADICTS",
                "isContradiction": True,
                "message": row["message"],
            })

        return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}
    except Exception as e:
        logger.warning(f"Neo4j offline for meeting {meeting_id}, using JSON fallback: {e}")
        return _build_fallback_meeting_graph(meeting_id)


_CONTAINMENT_LINK_TYPES = {"PARTICIPATED_IN", "MADE_IN", "MADE_BY", "ASSIGNED_TO", "RELATES_TO"}


def _resolve_target(person: str | None, caller: Employee) -> str | None:
    """Resolve /graph's `person` param into whose meetings to scope to. None
    means "org-wide" — only reachable by a management caller who passed no
    `person`. Any explicit `person` (self, or anyone else if the caller is
    management) is checked via require_access before being returned."""
    if person is not None:
        require_access(person, caller)
        return person
    return None if caller.is_management else caller.name


def _scope_to_meetings(nodes: dict[str, dict], links: list[dict], meeting_ids: set[str]) -> tuple[dict, list]:
    """Restrict a full graph to the given meetings and everything IN them,
    plus one hop out on CONTRADICTS edges so the *other* side of a flagged
    contradiction stays visible."""
    core_meetings = {f"meeting:{mid}" for mid in meeting_ids}
    if not core_meetings:
        return {}, []

    in_scope = set(core_meetings)
    changed = True
    while changed:
        changed = False
        for l in links:
            if l["type"] not in _CONTAINMENT_LINK_TYPES:
                continue
            if l["source"] in in_scope and l["target"] not in in_scope:
                in_scope.add(l["target"])
                changed = True
            elif l["target"] in in_scope and l["source"] not in in_scope:
                in_scope.add(l["source"])
                changed = True

    extra: set[str] = set()
    for l in links:
        if l["type"] == "CONTRADICTS" and (l["source"] in in_scope or l["target"] in in_scope):
            extra.add(l["source"])
            extra.add(l["target"])
    in_scope |= extra

    scoped_nodes = {nid: n for nid, n in nodes.items() if nid in in_scope}
    scoped_links = [l for l in links if l["source"] in in_scope and l["target"] in in_scope]
    return scoped_nodes, scoped_links


@router.get("/graph")
def get_global_graph_data(
    person: str | None = None,
    db: Session = Depends(get_db),
    caller: Employee = Depends(get_current_employee),
) -> dict:
    """Whole-organization knowledge graph ("Memory Graph" page). Defaults to
    the caller's own meetings (see _scope_to_meetings) once meeting
    participants are tracked; a management caller passing no `person` gets
    the unfiltered org-wide view. Pass `person` to view a specific
    employee's slice instead (management-only, checked via _resolve_target).
    """
    if not settings.neo4j_uri or "localhost" in settings.neo4j_uri or "127.0.0.1" in settings.neo4j_uri:
        nodes: dict[str, dict] = {}
        links: list[dict] = []
        try:
            for mid, _ in storage.list_summaries():
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

        for row in neo4j_service.run_query(
            "MATCH (m:Meeting) RETURN m.id AS id, coalesce(m.display_name, m.title) AS title"
        ):
            mid = f"meeting:{row['id']}"
            nodes[mid] = {"id": mid, "label": row["title"] or row["id"], "type": "Meeting"}

        for row in neo4j_service.run_query(
            "MATCH (p:Person)-[:PARTICIPATED_IN]->(m:Meeting) "
            "RETURN p.name AS name, coalesce(p.display_name, p.name) AS label, m.id AS meeting_id"
        ):
            pid = f"person:{row['name']}"
            nodes.setdefault(pid, {"id": pid, "label": row["label"], "type": "Person"})
            links.append({"source": pid, "target": f"meeting:{row['meeting_id']}", "type": "PARTICIPATED_IN"})

        for row in neo4j_service.run_query(
            """MATCH (d:Decision)-[:MADE_IN]->(m:Meeting)
               OPTIONAL MATCH (d)-[:MADE_BY]->(p:Person)
               RETURN d.id AS id, coalesce(d.display_name, d.text) AS text, m.id AS meeting_id,
                      p.name AS speaker, coalesce(p.display_name, p.name) AS speaker_label"""
        ):
            did = f"decision:{row['id']}"
            nodes[did] = {"id": did, "label": row["text"], "type": "Decision"}
            links.append({"source": did, "target": f"meeting:{row['meeting_id']}", "type": "MADE_IN"})
            if row["speaker"]:
                pid = f"person:{row['speaker']}"
                nodes.setdefault(pid, {"id": pid, "label": row["speaker_label"], "type": "Person"})
                links.append({"source": did, "target": pid, "type": "MADE_BY"})

        for row in neo4j_service.run_query(
            """MATCH (a:ActionItem)-[:MADE_IN]->(m:Meeting)
               OPTIONAL MATCH (a)-[:ASSIGNED_TO]->(p:Person)
               RETURN a.id AS id, coalesce(a.display_name, a.task) AS task, m.id AS meeting_id,
                      p.name AS assignee, coalesce(p.display_name, p.name) AS assignee_label"""
        ):
            aid = f"action:{row['id']}"
            nodes[aid] = {"id": aid, "label": row["task"], "type": "ActionItem"}
            links.append({"source": aid, "target": f"meeting:{row['meeting_id']}", "type": "MADE_IN"})
            if row["assignee"]:
                pid = f"person:{row['assignee']}"
                nodes.setdefault(pid, {"id": pid, "label": row["assignee_label"], "type": "Person"})
                links.append({"source": aid, "target": pid, "type": "ASSIGNED_TO"})

        for row in neo4j_service.run_query(
            "MATCH (m:Meeting)-[:RELATES_TO]->(pr:Project) "
            "RETURN m.id AS meeting_id, pr.name AS name, coalesce(pr.display_name, pr.name) AS label"
        ):
            prid = f"project:{row['name']}"
            nodes.setdefault(prid, {"id": prid, "label": row["label"], "type": "Project"})
            links.append({"source": f"meeting:{row['meeting_id']}", "target": prid, "type": "RELATES_TO"})

        for row in neo4j_service.run_query(
            "MATCH (d:Decision)-[:RELATES_TO]->(pr:Project) "
            "RETURN d.id AS decision_id, coalesce(d.display_name, d.text) AS decision_text, "
            "pr.name AS name, coalesce(pr.display_name, pr.name) AS label"
        ):
            did = f"decision:{row['decision_id']}"
            prid = f"project:{row['name']}"
            nodes.setdefault(did, {"id": did, "label": row["decision_text"], "type": "Decision"})
            nodes.setdefault(prid, {"id": prid, "label": row["label"], "type": "Project"})
            links.append({"source": did, "target": prid, "type": "RELATES_TO"})

        for row in neo4j_service.run_query(
            """MATCH (d:Decision)-[c:CONTRADICTS]->(other:Decision)
               RETURN d.id AS from_id, coalesce(d.display_name, d.text) AS from_text,
                      other.id AS to_id, coalesce(other.display_name, other.text) AS to_text,
                      c.message AS message"""
        ):
            from_did = f"decision:{row['from_id']}"
            to_did = f"decision:{row['to_id']}"
            nodes.setdefault(from_did, {"id": from_did, "label": row["from_text"], "type": "Decision"})
            nodes.setdefault(to_did, {"id": to_did, "label": row["to_text"], "type": "Decision"})
            links.append({
                "source": from_did,
                "target": to_did,
                "type": "CONTRADICTS",
                "isContradiction": True,
                "message": row["message"],
            })

        target = _resolve_target(person, caller)
        if target is not None:
            target_employee = (
                caller if target.lower() == caller.name.lower()
                else db.query(Employee).filter(func.lower(Employee.name) == target.lower()).first()
            )
            meeting_ids: set[str] = set()
            if target_employee is not None:
                meeting_ids = {
                    mp.meeting_id
                    for mp in db.query(MeetingParticipant).filter_by(employee_id=target_employee.id)
                }
            nodes, links = _scope_to_meetings(nodes, links, meeting_ids)

        return {"nodes": list(nodes.values()), "links": _drop_dangling_links(nodes, links)}
    except Exception as e:
        logger.warning(f"Neo4j offline for global graph: {e}")
        return {"nodes": [], "links": []}
