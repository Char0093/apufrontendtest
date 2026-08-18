"""POST /query — predefined Cypher-template Ask Coco queries (Task 5.5)."""
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import askcoco_service

router = APIRouter()


class QueryRequest(BaseModel):
    query: str


class Citation(BaseModel):
    filename: str
    timestamp: str
    speaker: str
    excerpt: str


class QueryResponse(BaseModel):
    answer: str
    results: list[dict[str, Any]] = Field(default_factory=list)
    cypher: str = ""
    citations: list[Citation] = Field(default_factory=list)


@router.post("/query", response_model=QueryResponse)
def ask_coco_query(payload: QueryRequest) -> QueryResponse:
    result = askcoco_service.ask(payload.query)
    return QueryResponse(**result)


@router.post("/api/chat", response_model=QueryResponse)
def ask_coco_chat(payload: QueryRequest) -> QueryResponse:
    result = askcoco_service.ask(payload.query)
    return QueryResponse(**result)
