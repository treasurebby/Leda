"""The Sabi pipeline: a WhatsApp message in, an order and/or an instant reply out.

    ingest -> transcribe (voice) -> extract (LLM) -> persist -> reply -> notify

Each provider sits behind a Protocol, so this module is fully testable with fakes.
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.claude import DecodedOrder, DecodeInput, Decoder
from app.integrations.storage import Storage, new_key
from app.integrations.whatsapp import WhatsAppClient
from app.integrations.whisper import Transcriber
from app.models import (
    Business,
    Channel,
    Evidence,
    EvidenceKind,
    Flag,
    FlagKind,
    FlagStatus,
    Notification,
    Order,
    OrderLine,
    OrderStatus,
    Product,
    Retailer,
    ReviewState,
)
from app.services import ledger as ledger_svc
from app.services import orders as order_svc
from app.services import reply as reply_svc

log = logging.getLogger(__name__)


@dataclass
class Signal:
    """What the retailer sent, before any interpretation."""

    from_number: str
    text: str | None = None
    audio: tuple[bytes, str] | None = None
    image: tuple[bytes, str] | None = None
    sender_name: str | None = None
    raw: dict | None = None


@dataclass
class Providers:
    storage: Storage
    transcriber: Transcriber
    decoder: Decoder
    whatsapp: WhatsAppClient


@dataclass
class DecodeResult:
    order: Order | None
    decoded: DecodedOrder
    reply_text: str | None


async def decode_signal(db: AsyncSession, business_id: uuid.UUID, signal: Signal, providers: Providers) -> DecodeResult:
    business = await db.get(Business, business_id)
    assert business is not None
    retailer = await reply_svc.ensure_retailer(db, business, signal.from_number, signal.sender_name)
    channel = Channel.voice if signal.audio else Channel.photo if signal.image else Channel.text

    products = (await db.execute(select(Product).where(Product.business_id == business_id))).scalars().all()
    by_sku = {p.sku: p for p in products}
    catalog = [
        {"sku": p.sku, "name": p.name, "unit": p.unit, "price": str(p.price), "aliases": p.aliases or []}
        for p in products
    ]

    # 1. Transcribe voice notes. The transcript is kept verbatim as its own evidence row.
    transcript = None
    if signal.audio:
        transcript = await providers.transcriber.transcribe(
            signal.audio[0], signal.audio[1], [p.name for p in products]
        )

    # 2. Extract.
    decoded = await providers.decoder.decode(
        DecodeInput(
            catalog=catalog,
            retailer_name=retailer.name,
            recent_skus=await _recent_skus(db, retailer),
            transcript=transcript,
            text=signal.text,
            image=signal.image,
        )
    )

    # 3. Persist an order only when they actually ordered something; store the original signals untouched.
    order: Order | None = None
    if decoded.lines:
        order = Order(
            business_id=business_id,
            number=await order_svc.next_order_number(db, business_id),
            retailer_id=retailer.id,
            channel=channel,
            status=OrderStatus.processing,
            lines=[],
            flags=[],
            evidence=[],
        )
        db.add(order)
        await db.flush()
        await _store_evidence(db, order, business_id, signal, transcript, providers.storage)
        _apply_lines(order, decoded, by_sku)
        await db.flush()
        _apply_flags(order, decoded)
        order_svc.recompute(order)
        await db.flush()

    # 4. Reply on WhatsApp with what we understood, prices, questions, and where to pay.
    reply_text: str | None = None
    if business.auto_reply:
        await reply_svc.ensure_virtual_account(db, retailer)
        if order is not None and order.status == OrderStatus.processing:
            # Nothing to check: raise the invoice now so the retailer's transfer can be matched when it lands.
            await order_svc.confirm(db, order)
            await ledger_svc.post_invoice(db, order)
        reply_text = reply_svc.compose_reply(business, retailer, order, decoded, by_sku)
        if order is not None:
            for f in order.flags:
                if f.status == FlagStatus.open:
                    f.status = FlagStatus.asked_retailer
            order.reply_text = reply_text
        await providers.whatsapp.send_text(signal.from_number, reply_text)
        await db.flush()

    # 5. Notify the distributor.
    if order is not None:
        asked = sum(1 for f in order.flags if f.status != FlagStatus.resolved)
        db.add(
            Notification(
                business_id=business_id,
                kind="flag" if asked else "order",
                order_id=order.id,
                title=f"{order.number} needs your eye" if asked else f"{order.number} from {retailer.name}",
                detail=(
                    f"Sabi asked {retailer.name} {asked} question{'s' if asked != 1 else ''} "
                    f"on the {channel.value} order"
                    if asked
                    else f"{len(order.lines)} lines, ₦{order.subtotal:,.0f} — invoice sent"
                ),
            )
        )
    elif decoded.inquiries:
        db.add(
            Notification(
                business_id=business_id,
                kind="order",
                title=f"{retailer.name} asked about {len(decoded.inquiries)} item(s)",
                detail=decoded.summary[:255],
            )
        )
    await db.flush()
    return DecodeResult(order=order, decoded=decoded, reply_text=reply_text)


async def answer_question(
    db: AsyncSession, business_id: uuid.UUID, retailer: Retailer, answer: int, providers: Providers
) -> bool:
    """A retailer replied with a number to one of Sabi's questions. Returns False if there was nothing to answer."""
    found = await reply_svc.open_question_for(db, business_id, retailer.id)
    if found is None:
        return False
    order, flag = found
    if answer < 1 or answer > len(flag.options):
        await providers.whatsapp.send_text(
            retailer.phone or "", f"Please reply with a number between 1 and {len(flag.options)}."
        )
        return True
    await order_svc.resolve_flag(db, order, flag, answer - 1, user_id=None)
    remaining = [f for f in order.flags if f.status == FlagStatus.asked_retailer]
    if remaining:
        text = reply_svc.questions_block(remaining)
    else:
        if order.status == OrderStatus.processing:
            await order_svc.confirm(db, order)
            await ledger_svc.post_invoice(db, order)
        text = reply_svc.invoice_reply(order, retailer)
    order.reply_text = text
    await providers.whatsapp.send_text(retailer.phone or "", text)
    await db.flush()
    return True


async def _store_evidence(
    db, order: Order, business_id, signal: Signal, transcript: str | None, storage: Storage
) -> None:
    if signal.text:
        order.evidence.append(
            Evidence(order_id=order.id, kind=EvidenceKind.text, text=signal.text, raw_payload=signal.raw or {})
        )
    if signal.audio:
        content, mime = signal.audio
        key = new_key(business_id, "voice", mime)
        await storage.put(key, content, mime)
        order.evidence.append(
            Evidence(
                order_id=order.id, kind=EvidenceKind.voice, storage_key=key, mime=mime, raw_payload=signal.raw or {}
            )
        )
    if signal.image:
        content, mime = signal.image
        key = new_key(business_id, "photo", mime)
        await storage.put(key, content, mime)
        order.evidence.append(
            Evidence(
                order_id=order.id, kind=EvidenceKind.photo, storage_key=key, mime=mime, raw_payload=signal.raw or {}
            )
        )
    if transcript is not None:
        order.evidence.append(Evidence(order_id=order.id, kind=EvidenceKind.transcript, text=transcript))
    await db.flush()


def _apply_lines(order: Order, decoded: DecodedOrder, by_sku: dict[str, Product]) -> None:
    lines: list[OrderLine] = []
    for position, dl in enumerate(decoded.lines):
        product = by_sku.get(dl.sku)
        if product is None:
            log.warning("decoder returned unknown sku %s for %s", dl.sku, order.number)
            continue
        lines.append(
            OrderLine(
                id=uuid.uuid4(),  # assigned now so flags can reference the line before flush
                order_id=order.id,
                position=position,
                product_id=product.id,
                product_name=product.name,
                sku=product.sku,
                unit=product.unit,
                quantity=dl.quantity,
                unit_price=product.price,
                confidence_score=dl.confidence,
                review_state=order_svc.review_state_for(dl.confidence),
                reasoning=dl.reasoning,
            )
        )
    order.lines = lines


def _apply_flags(order: Order, decoded: DecodedOrder) -> None:
    lines = order.lines
    for df in decoded.flags:
        line = lines[df.line_index] if df.line_index is not None and 0 <= df.line_index < len(lines) else None
        if line is not None:
            line.review_state = ReviewState.check
        order.flags.append(
            Flag(
                order_id=order.id,
                line_id=line.id if line else None,
                kind=FlagKind(df.kind),
                issue=df.issue,
                quote=df.quote,
                why=df.why,
                options=[o.model_dump() for o in df.options],
                confidence=df.confidence,
            )
        )


async def _recent_skus(db: AsyncSession, retailer: Retailer | None) -> list[str]:
    if retailer is None:
        return []
    rows = await db.execute(
        select(OrderLine.sku)
        .join(Order, Order.id == OrderLine.order_id)
        .where(Order.retailer_id == retailer.id, OrderLine.sku.is_not(None))
        .order_by(Order.created_at.desc())
        .limit(20)
    )
    seen: list[str] = []
    for (sku,) in rows:
        if sku not in seen:
            seen.append(sku)
    return seen[:8]
