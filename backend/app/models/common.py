"""Shared column types that behave on Postgres (prod) and SQLite (tests)."""

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

JSONType = JSON().with_variant(JSONB(), "postgresql")
