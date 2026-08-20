"""Personal dashboard queries with graceful offline Neo4j fallback."""
from app.graph.neo4j_service import run_query
from app.services.storage_service import StorageService
storage = StorageService()


def get_dashboard(user_id: str) -> dict:
    try:
        action_items = run_query(
            "MATCH (a:ActionItem)-[:ASSIGNED_TO]->(p:Person {name: $user_id}) "
            "RETURN a.task AS task, a.deadline AS deadline, a.priority AS priority "
            "ORDER BY a.deadline",
            user_id=user_id,
        )
        flags = run_query(
            "MATCH (d:Decision)-[:MADE_BY]->(p:Person {name: $user_id}) "
            "MATCH (d)-[r:CONTRADICTS]->(:Decision) "
            "OPTIONAL MATCH (d)-[:MADE_IN]->(m:Meeting) "
            "RETURN r.message AS message, m.id AS meeting_id",
            user_id=user_id,
        )
        upcoming_meetings = run_query(
            "MATCH (p:Person {name: $user_id})-[:PARTICIPATED_IN]->(m:Meeting) "
            "RETURN m.id AS id, m.title AS title ORDER BY m.date DESC LIMIT 10",
            user_id=user_id,
        )
        return {
            "user_id": user_id,
            "action_items": action_items,
            "flags": flags,
            "upcoming_meetings": upcoming_meetings,
        }
    except Exception:
        # Graceful fallback: aggregate from stored meeting summaries
        action_items = []
        flags = []
        upcoming_meetings = []
        try:
            for mid, sum_data in storage.list_summaries():
                for a in sum_data.get("action_items", []):
                    if user_id.lower() in str(a.get("assignee", "")).lower():
                        action_items.append({
                            "task": a.get("task"),
                            "deadline": a.get("deadline", "soon"),
                            "priority": a.get("priority", "Medium")
                        })
                for f in sum_data.get("flags", []):
                    flags.append({
                        "message": f.get("message", "Contradiction detected"),
                        "meeting_id": mid
                    })
        except Exception:
            pass

        return {
            "user_id": user_id,
            "action_items": action_items,
            "flags": flags,
            "upcoming_meetings": upcoming_meetings,
        }
