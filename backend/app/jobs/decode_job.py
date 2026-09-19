"""Inbound WhatsApp message -> Signal -> Sabi pipeline. Runs as a background task in its own session."""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.integrations.claude import get_decoder
from app.integrations.storage import get_storage
from app.integrations.whatsapp import InboundMessage, get_whatsapp
from app.integrations.whisper import get_transcriber
from app.models import Business, Retailer, WhatsAppMessage
from app.services.decode import Providers, Signal, answer_question, decode_signal

log = logging.getLogger(__name__)


async def handle_inbound(message: InboundMessage, session_factory, business_id: uuid.UUID | None = None) -> None:
    async with session_factory() as db:
        # Dedupe on the WhatsApp message id.
        log_row = WhatsAppMessage(
            wa_message_id=message.wa_message_id,
            from_number=message.from_number,
            kind=message.kind,
            media_id=message.media_id,
            payload={k: v for k, v in message.raw.items() if k != "inline_media"},
        )
        db.add(log_row)
        try:
            await db.commit()  # committed on its own so the dedupe holds even if decoding fails below
        except IntegrityError:
            await db.rollback()
            log.info("duplicate WhatsApp message %s ignored", message.wa_message_id)
            return

        if business_id is None:
            business_id = await _route(db, message.from_number)
        if business_id is None:
            log_row.error = "No business matched this sender"
            await db.commit()
            return
        log_row.business_id = business_id

        if message.kind not in ("text", "audio", "image"):
            log_row.error = f"Unsupported message type {message.kind}"
            await db.commit()
            return

        providers = Providers(get_storage(), get_transcriber(), get_decoder(), get_whatsapp())

        # A bare number from a retailer with an open question is an answer, not a new order.
        if message.kind == "text" and message.text and message.text.strip().isdigit():
            retailer = await db.scalar(
                select(Retailer).where(Retailer.business_id == business_id, Retailer.phone == message.from_number)
            )
            if retailer is not None:
                try:
                    if await answer_question(db, business_id, retailer, int(message.text.strip()), providers):
                        await db.commit()
                        return
                except Exception as exc:
                    log.exception("answer handling failed for %s", message.wa_message_id)
                    await db.rollback()
                    log_row = await db.get(WhatsAppMessage, log_row.id)
                    if log_row is not None:
                        log_row.error = str(exc)[:255]
                        await db.commit()
                    return

        signal = Signal(
            from_number=message.from_number, text=message.text, sender_name=message.sender_name, raw=log_row.payload
        )
        if message.kind in ("audio", "image"):
            inline = message.raw.get("inline_media")
            if inline is not None:
                content, mime = inline, message.mime or "application/octet-stream"
            elif message.media_id:
                content, mime = await get_whatsapp().download_media(message.media_id)
            else:
                log_row.error = "Media message without media id"
                await db.commit()
                return
            if message.kind == "audio":
                signal.audio = (content, mime)
            else:
                signal.image = (content, mime)

        try:
            result = await decode_signal(db, business_id, signal, providers)
            log_row.order_id = result.order.id if result.order else None
            await db.commit()
        except Exception as exc:
            log.exception("decode failed for %s", message.wa_message_id)
            await db.rollback()
            log_row = await db.get(WhatsAppMessage, log_row.id)
            if log_row is not None:
                log_row.error = str(exc)[:255]
                await db.commit()


async def _route(db, from_number: str) -> uuid.UUID | None:
    """Which business does this sender belong to? Known retailer phone first; single-tenant fallback second."""
    retailer = await db.scalar(select(Retailer).where(Retailer.phone == from_number))
    if retailer:
        return retailer.business_id
    ids = (await db.execute(select(Business.id).limit(2))).scalars().all()
    return ids[0] if len(ids) == 1 else None
