"""Pydantic request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000, description="Raw text to extract facts from")


class IngestResponse(BaseModel):
    nodes_created: int
    edges_created: int
    edges_superseded: int
    tokens_used: int


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=5000)
    strategy: str = Field(default="pagerank", pattern="^(full_dump|flat_rag|pagerank)$")
    bubble: float = Field(default=0.15, ge=0.0, le=1.0)


class CompareRequest(BaseModel):
    question: str = Field(min_length=1, max_length=5000)
    expected_answer: str | None = None


class CompareRequest(BaseModel):
    question: str = Field(min_length=1, max_length=5000)
    expected_answer: str | None = None
