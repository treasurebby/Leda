"""Isolated browser-test server. Never deploy this module or use a real database."""

import os

if os.environ.get("LEDA_E2E") != "1":
    raise RuntimeError("This server is only for the Playwright test runner")

# Set every external boundary before importing the application or reading .env.
os.environ.update(
    {
        "APP_ENV": "test",
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
        "SECRET_KEY": "browser-test-only-secret-with-at-least-32-characters",
        "PUBLIC_APP_URL": "http://127.0.0.1:5174",
        "RESEND_API_KEY": "",
        "PAYSTACK_SECRET_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "OPENAI_API_KEY": "",
        "S3_BUCKET": "",
        "WHATSAPP_ACCESS_TOKEN": "",
    }
)

from contextlib import asynccontextmanager  # noqa: E402

from app.core.db import Base, engine  # noqa: E402
from app.integrations.email import FakeEmailSender, get_email_sender  # noqa: E402
from app.main import create_app  # noqa: E402

mailer = FakeEmailSender()
app = create_app()
app.dependency_overrides[get_email_sender] = lambda: mailer


@asynccontextmanager
async def lifespan(_app):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app.router.lifespan_context = lifespan


@app.get("/api/test/mail")
async def mail(email: str):
    return [{"text": item.text, "subject": item.subject} for item in mailer.sent if item.to == email]
