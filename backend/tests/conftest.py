"""Test harness: SQLite in-memory DB, fake integrations, and helpers to sign in."""

import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-bytes-long")
# The suite must not pick up real provider credentials from backend/.env: every integration runs as its fake.
for _key in (
    "RESEND_API_KEY",
    "S3_BUCKET",
    "PAYSTACK_SECRET_KEY",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_APP_SECRET",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
):
    os.environ[_key] = ""
os.environ["DECODER"] = "fake"

from collections.abc import AsyncIterator  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.db import Base, get_db, get_session_factory  # noqa: E402
from app.integrations.email import FakeEmailSender, get_email_sender  # noqa: E402
from app.main import create_app  # noqa: E402

OWNER = {
    "full_name": "Ada Okafor",
    "phone": "0803 405 1198",
    "email": "ada@okaforprovisions.ng",
    "password": "Strong pass 1",
    "business_name": "Okafor Provisions",
    "industry": "Foodstuff & groceries",
}


TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")  # e.g. postgresql+asyncpg://leda@127.0.0.1:5434/leda_test


@pytest.fixture
async def engine():
    """In-memory SQLite by default; set TEST_DATABASE_URL to run the same suite against Postgres."""
    if TEST_DATABASE_URL:
        eng = create_async_engine(TEST_DATABASE_URL)
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    else:
        eng = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def db(engine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with maker() as session:
        yield session


@pytest.fixture
def mailer() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
async def client(engine, mailer) -> AsyncIterator[AsyncClient]:
    app = create_app()
    maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def _db():
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_session_factory] = lambda: maker
    app.dependency_overrides[get_email_sender] = lambda: mailer
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        c.app = app  # type: ignore[attr-defined]
        yield c


async def register(client: AsyncClient, **overrides) -> str:
    """Register an owner + business and return the access token."""
    resp = await client.post("/api/v1/auth/register", json={**OWNER, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def owner_token(client) -> str:
    return await register(client)
