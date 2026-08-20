from typing import Any

from pydantic import BaseModel, Field


class CocoMessageCreate(BaseModel):
    role: str  # 'user' | 'ai'
    text: str
    citations: list[dict[str, Any]] = Field(default_factory=list)


class CocoMessageItem(BaseModel):
    id: str
    role: str
    text: str
    citations: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str
