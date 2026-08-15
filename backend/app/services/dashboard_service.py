"""Personal dashboard queries for the demo user contract (Task 5.6)."""
from app.graph.neo4j_service import run_query


def get_dashboard(user_id: str) -> dict:
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
