"""Paystack: customers, dedicated virtual accounts (DVA) and webhook verification.

Docs: https://paystack.com/docs/payments/dedicated-virtual-accounts/
Webhook: POST with header x-paystack-signature = HMAC-SHA512(secret, raw body).
"""

import hashlib
import hmac
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)
BASE = "https://api.paystack.co"


@dataclass
class VirtualAccount:
    customer_code: str
    account_number: str
    bank_name: str
    account_name: str


def verify_signature(secret: str, body: bytes, signature: str | None) -> bool:
    if not secret:
        return True  # fake provider in dev/tests
    if not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


class PaystackClient(Protocol):
    async def create_virtual_account(
        self, *, email: str, name: str, phone: str | None, preferred_bank: str = "wema-bank"
    ) -> VirtualAccount: ...


@dataclass
class FakePaystack:
    created: list[VirtualAccount] = field(default_factory=list)

    async def create_virtual_account(
        self, *, email: str, name: str, phone: str | None, preferred_bank: str = "wema-bank"
    ) -> VirtualAccount:
        n = len(self.created) + 1
        va = VirtualAccount(
            customer_code=f"CUS_FAKE{n:04d}", account_number=f"99{n:08d}", bank_name="Test Bank", account_name=name
        )
        self.created.append(va)
        return va


class LivePaystack:
    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=BASE, timeout=30, headers={"Authorization": f"Bearer {self.secret_key}"})

    async def create_virtual_account(
        self, *, email: str, name: str, phone: str | None, preferred_bank: str = "wema-bank"
    ) -> VirtualAccount:
        first, _, last = name.partition(" ")
        async with self._client() as client:
            cust = await client.post(
                "/customer", json={"email": email, "first_name": first, "last_name": last or first, "phone": phone}
            )
            cust.raise_for_status()
            code = cust.json()["data"]["customer_code"]
            dva = await client.post("/dedicated_account", json={"customer": code, "preferred_bank": preferred_bank})
            dva.raise_for_status()
            data: dict[str, Any] = dva.json()["data"]
            return VirtualAccount(
                customer_code=code,
                account_number=data["account_number"],
                bank_name=data["bank"]["name"],
                account_name=data["account_name"],
            )


_default: PaystackClient | None = None


def get_paystack() -> PaystackClient:
    global _default
    if _default is None:
        _default = LivePaystack(settings.paystack_secret_key) if settings.paystack_secret_key else FakePaystack()
    return _default


def set_paystack(client: PaystackClient | None) -> None:
    global _default
    _default = client
