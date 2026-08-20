"""POST /query  Personalized Ask Coco query endpoint."""
from typing import Any
from fastapi import APIRouter
from pydantic import BaseModel, Field
from app.services import askcoco_service

router = APIRouter()


class QueryRequest(BaseModel):
    query: str
    user_id: str | None = None
    user_role: str | None = None


class Citation(BaseModel):
    filename: str = ""
    timestamp: str = ""
    speaker: str = ""
    excerpt: str = ""


class QueryResponse(BaseModel):
    answer: str
    results: list[dict[str, Any]] = Field(default_factory=list)
    cypher: str = ""
    citations: list[Citation] = Field(default_factory=list)


@router.post("/query", response_model=QueryResponse)
def ask_coco_query(payload: QueryRequest) -> QueryResponse:
    result = askcoco_service.ask(payload.query, user_id=payload.user_id, user_role=payload.user_role)
    return QueryResponse(**result)


@router.post("/api/chat", response_model=QueryResponse)
def ask_coco_chat(payload: QueryRequest) -> QueryResponse:
    result = askcoco_service.ask(payload.query, user_id=payload.user_id, user_role=payload.user_role)
    return QueryResponse(**result)
