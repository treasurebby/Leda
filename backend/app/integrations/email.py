"""Outbound email. Resend in production; a logging fake when no key is configured or in tests."""

import logging
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)


@dataclass
class OutboundEmail:
    to: str
    subject: str
    html: str
    text: str = ""


class EmailSender(Protocol):
    async def send(self, email: OutboundEmail) -> None: ...


@dataclass
class FakeEmailSender:
    sent: list[OutboundEmail] = field(default_factory=list)

    async def send(self, email: OutboundEmail) -> None:
        self.sent.append(email)
        log.info("[fake email] to=%s subject=%s", email.to, email.subject)


class ResendEmailSender:
    def __init__(self, api_key: str, sender: str):
        self.api_key = api_key
        self.sender = sender

    async def send(self, email: OutboundEmail) -> None:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "from": self.sender,
                    "to": [email.to],
                    "subject": email.subject,
                    "html": email.html,
                    "text": email.text or None,
                },
            )
            resp.raise_for_status()


_default: EmailSender | None = None


def get_email_sender() -> EmailSender:
    global _default
    if _default is None:
        if settings.resend_api_key:
            _default = ResendEmailSender(settings.resend_api_key, settings.email_from)
        else:
            _default = FakeEmailSender()
    return _default
