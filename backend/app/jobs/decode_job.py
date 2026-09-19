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
from app.services import catalog as catalog_svc
from app.services.decode import Providers, Signal, answer_question, decode_signal
from app.services.reply import send_and_log

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
            business_id = await _route(db, message.from_number, message.to_number)
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

        # The owner (or a team member) messaging Leda is managing the catalog, not placing an order.
        log_id = log_row.id
        business = await db.get(Business, business_id)
        if business is not None and await catalog_svc.is_owner_number(db, business, message.from_number):
            try:
                await handle_owner_message(db, business, message, providers)
                await db.commit()
            except Exception as exc:
                log.exception("owner message failed for %s", message.wa_message_id)
                await db.rollback()
                await _record_error(db, log_id, exc)
            return

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
                    await _record_error(db, log_id, exc)
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
            await _record_error(db, log_id, exc)


async def _record_error(db, log_id: uuid.UUID, exc: Exception) -> None:
    row = await db.get(WhatsAppMessage, log_id)
    if row is not None:
        row.error = str(exc)[:255]
        await db.commit()


async def _route(db, from_number: str, to_number: str | None) -> uuid.UUID | None:
    """Which business is this for? A known retailer phone; else the business whose WhatsApp number received it;
    else, when there is exactly one business, that one."""
    retailer = await db.scalar(select(Retailer).where(Retailer.phone == from_number))
    if retailer:
        return retailer.business_id
    if to_number:
        biz = await db.scalar(select(Business.id).where(Business.whatsapp_number == to_number))
        if biz:
            return biz
    ids = (await db.execute(select(Business.id).limit(2))).scalars().all()
    return ids[0] if len(ids) == 1 else None


async def handle_owner_message(db, business: Business, message: InboundMessage, providers: Providers) -> None:
    """Price list in -> draft + confirmation question. YES/NO -> apply or discard the pending draft."""
    wa = providers.whatsapp
    text = (message.text or "").strip()
    pending = await catalog_svc.pending_draft(db, business.id)

    if message.kind == "text" and pending is not None and text.lower() in {"yes", "y", "ok", "okay", "add", "confirm"}:
        await catalog_svc.apply_draft(db, pending)
        await send_and_log(db, wa, business.id, message.from_number, catalog_svc.applied_reply(pending))
        return
    if message.kind == "text" and pending is not None and text.lower() in {"no", "n", "cancel", "discard"}:
        await catalog_svc.discard_draft(db, pending)
        await send_and_log(
            db, wa, business.id, message.from_number, "Discarded. Send the price list again whenever you're ready."
        )
        return

    audio = image = None
    if message.kind in ("audio", "image"):
        inline = message.raw.get("inline_media")
        if inline is not None:
            content, mime = inline, message.mime or "application/octet-stream"
        elif message.media_id:
            content, mime = await wa.download_media(message.media_id)
        else:
            await send_and_log(
                db, wa, business.id, message.from_number, "I couldn't read that attachment. Try sending it again."
            )
            return
        if message.kind == "audio":
            audio = (content, mime)
        else:
            image = (content, mime)
    elif message.kind != "text" or not text:
        await send_and_log(
            db,
            wa,
            business.id,
            message.from_number,
            f"Hi, this is Leda for {business.name}. Send your price list as text, a photo, or a voice note and I'll "
            "add the products to your catalog.",
        )
        return

    decoded = await catalog_svc.extract(
        providers.decoder, providers.transcriber, text=text or None, audio=audio, image=image
    )
    if not any(item.price is not None for item in decoded.items):
        await send_and_log(
            db,
            wa,
            business.id,
            message.from_number,
            "I couldn't find any products with prices in that. Send it as lines like 'Royal Stallion 50kg - 78,500'.",
        )
        return
    if pending is not None:
        await catalog_svc.discard_draft(db, pending)  # a new list supersedes an unconfirmed one
    draft = await catalog_svc.create_draft(db, business.id, "whatsapp", decoded)
    await send_and_log(db, wa, business.id, message.from_number, catalog_svc.draft_reply(draft))
