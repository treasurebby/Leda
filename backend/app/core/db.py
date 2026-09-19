import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from sqlalchemy import DateTime, MetaData, Numeric, String, TypeDecorator, Uuid
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Reusable column annotations. Money is NUMERIC(18,2) everywhere and never a float.
uuid_pk = Annotated[uuid.UUID, mapped_column(Uuid, primary_key=True, default=uuid.uuid4)]
money = Annotated[Decimal, mapped_column(Numeric(18, 2), default=Decimal("0"))]
str_120 = Annotated[str, mapped_column(String(120))]
str_255 = Annotated[str, mapped_column(String(255))]


def utcnow() -> datetime:
    return datetime.now(UTC)


class TZDateTime(TypeDecorator):
    """Timezone-aware datetime that stays aware on SQLite (tests) as well as Postgres."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, onupdate=utcnow, nullable=False)


engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Injectable so background jobs use the same DB as the request (tests override this)."""
    return SessionLocal
