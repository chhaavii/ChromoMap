"""Database schema and session handling for ChronoMem."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.config import DATABASE_PATH


def utcnow() -> datetime:
    """Naive UTC datetime; stored/compared consistently as UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    """ISO 8601 UTC string, always suffixed with Z."""
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def new_id() -> str:
    return uuid.uuid4().hex


engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    label: Mapped[str] = mapped_column(String(200), index=True)
    type: Mapped[str] = mapped_column(String(20), default="other")
    cluster: Mapped[str] = mapped_column(String(20), default="other")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    token_cost: Mapped[int] = mapped_column(Integer, default=0)

    def to_dict(self, strength: float = 0.0, recency: float = 0.0) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "type": self.type,
            "cluster": self.cluster,
            "created_at": iso(self.created_at),
            "pinned": self.pinned,
            "muted": self.muted,
            "token_cost": self.token_cost,
            "strength": round(strength, 4),
            "recency": round(recency, 4),
        }


class Edge(Base):
    __tablename__ = "edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), index=True
    )
    target_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), index=True
    )
    relation: Mapped[str] = mapped_column(String(100), index=True)
    valid_from: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    status: Mapped[str] = mapped_column(String(20), default="current")  # current|superseded
    superseded_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source_text: Mapped[str] = mapped_column(Text, default="")

    def to_dict(self, active: bool | None = None) -> dict:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "target_id": self.target_id,
            "relation": self.relation,
            "valid_from": iso(self.valid_from),
            "valid_to": iso(self.valid_to),
            "recorded_at": iso(self.recorded_at),
            "status": self.status,
            "superseded_by": self.superseded_by,
            "weight": self.weight,
            "use_count": self.use_count,
            "last_used_at": iso(self.last_used_at),
            "source_text": self.source_text,
            "active": active,
        }


class QueryLog(Base):
    __tablename__ = "query_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    question: Mapped[str] = mapped_column(Text)
    strategy: Mapped[str] = mapped_column(String(20), index=True)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    node_ids_used: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    answer: Mapped[str] = mapped_column(Text, default="")
    correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class HashLog(Base):
    """Append-only SHA-256 chained audit log."""
    __tablename__ = "hash_log"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(36), default=new_id, unique=True)
    prev_hash: Mapped[str] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64), index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BenchmarkQuestion(Base):
    __tablename__ = "benchmark_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    question: Mapped[str] = mapped_column(Text)
    expected_answer: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_session():
    """FastAPI dependency / plain context session factory."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
