"""Shared pytest fixtures: isolated temp DB + fake LLM."""
from __future__ import annotations

import os
import tempfile

import pytest

# Point the DB at a temp file BEFORE importing app modules.
_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = os.path.join(_tmpdir, "test.db")
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-key-not-real")

from fastapi.testclient import TestClient  # noqa: E402

from app import db as app_db  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    app_db.init_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def reset_db(client):
    """Wipe all tables before a test."""
    from app.db import Base, engine

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
