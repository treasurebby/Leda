"""Inbound WhatsApp message -> evidence -> Sabi decode -> order. Filled in by the decoding phase."""

import uuid

from app.integrations.whatsapp import InboundMessage


async def handle_inbound(message: InboundMessage, session_factory, business_id: uuid.UUID | None = None) -> None:
    raise NotImplementedError("decode pipeline lands in the next phase")
