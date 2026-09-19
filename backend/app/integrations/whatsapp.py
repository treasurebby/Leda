"""Meta WhatsApp Cloud API. Inbound is handled by the webhook router; this module covers verification,
media download and outbound messages. A recording fake is used when no token is configured."""

import hashlib
import hmac
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import settings
from app.models import Flag, Order

log = logging.getLogger(__name__)
GRAPH = "https://graph.facebook.com/v21.0"


@dataclass
class InboundMessage:
    wa_message_id: str
    from_number: str  # E.164 with +
    kind: str  # text | audio | image | other
    text: str | None = None
    media_id: str | None = None
    mime: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


def verify_signature(app_secret: str, body: bytes, signature_header: str | None) -> bool:
    if not app_secret:
        return True  # dev without a secret
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header[7:])


def parse_inbound(payload: dict[str, Any]) -> list[InboundMessage]:
    """Flatten a Cloud API webhook payload into messages we care about."""
    out: list[InboundMessage] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                kind = msg.get("type")
                item = InboundMessage(
                    wa_message_id=msg["id"], from_number="+" + msg["from"].lstrip("+"), kind=kind or "other", raw=msg
                )
                if kind == "text":
                    item.text = msg.get("text", {}).get("body")
                elif kind in ("audio", "image"):
                    media = msg.get(kind, {})
                    item.media_id = media.get("id")
                    item.mime = media.get("mime_type")
                    item.text = media.get("caption")
                out.append(item)
    return out


class WhatsAppClient(Protocol):
    async def download_media(self, media_id: str) -> tuple[bytes, str]: ...
    async def send_text(self, to: str, body: str) -> None: ...
    async def send_order_confirmation(self, order: Order) -> None: ...
    async def ask_retailer(self, order: Order, flag: Flag) -> None: ...


def confirmation_text(order: Order) -> str:
    lines = "\n".join(
        f"• {ln.quantity} × {ln.product_name} ({ln.unit or 'unit'}) — ₦{ln.unit_price * ln.quantity:,.0f}"
        for ln in order.lines
    )
    ref = order.retailer.account_reference if order.retailer and order.retailer.account_reference else order.number
    return (
        f"Order {order.number} confirmed:\n{lines}\nTotal: ₦{order.subtotal:,.0f}\n"
        f"Pay by transfer using reference {ref}."
    )


def question_text(order: Order, flag: Flag) -> str:
    opts = "\n".join(f"{i + 1}. {o.get('label')}" for i, o in enumerate(flag.options))
    return f"Quick check on your order {order.number}: {flag.issue}\nDid you mean:\n{opts}\nReply with the number."


@dataclass
class FakeWhatsApp:
    sent: list[tuple[str, str]] = field(default_factory=list)
    media: dict[str, tuple[bytes, str]] = field(default_factory=dict)

    async def download_media(self, media_id: str) -> tuple[bytes, str]:
        return self.media.get(media_id, (b"", "application/octet-stream"))

    async def send_text(self, to: str, body: str) -> None:
        self.sent.append((to, body))
        log.info("[fake whatsapp] to=%s body=%s", to, body[:80])

    async def send_order_confirmation(self, order: Order) -> None:
        to = order.retailer.phone if order.retailer and order.retailer.phone else "unknown"
        await self.send_text(to, confirmation_text(order))

    async def ask_retailer(self, order: Order, flag: Flag) -> None:
        to = order.retailer.phone if order.retailer and order.retailer.phone else "unknown"
        await self.send_text(to, question_text(order, flag))


class CloudApiWhatsApp:
    def __init__(self, token: str, phone_number_id: str):
        self.token = token
        self.phone_number_id = phone_number_id

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=30, headers={"Authorization": f"Bearer {self.token}"})

    async def download_media(self, media_id: str) -> tuple[bytes, str]:
        async with self._client() as client:
            meta = (await client.get(f"{GRAPH}/{media_id}")).raise_for_status().json()
            resp = (await client.get(meta["url"])).raise_for_status()
            return resp.content, meta.get("mime_type") or resp.headers.get("content-type", "application/octet-stream")

    async def send_text(self, to: str, body: str) -> None:
        async with self._client() as client:
            resp = await client.post(
                f"{GRAPH}/{self.phone_number_id}/messages",
                json={"messaging_product": "whatsapp", "to": to.lstrip("+"), "type": "text", "text": {"body": body}},
            )
            resp.raise_for_status()

    async def send_order_confirmation(self, order: Order) -> None:
        if order.retailer and order.retailer.phone:
            await self.send_text(order.retailer.phone, confirmation_text(order))

    async def ask_retailer(self, order: Order, flag: Flag) -> None:
        if order.retailer and order.retailer.phone:
            await self.send_text(order.retailer.phone, question_text(order, flag))


_default: WhatsAppClient | None = None


def get_whatsapp() -> WhatsAppClient:
    global _default
    if _default is None:
        if settings.whatsapp_access_token and settings.whatsapp_phone_number_id:
            _default = CloudApiWhatsApp(settings.whatsapp_access_token, settings.whatsapp_phone_number_id)
        else:
            _default = FakeWhatsApp()
    return _default


def set_whatsapp(client: WhatsAppClient | None) -> None:
    global _default
    _default = client
