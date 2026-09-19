"""The Sabi pipeline: evidence in, an order with confidence-scored lines and flags out.

    ingest -> transcribe (voice) -> extract (Claude) -> persist -> notify

Each provider sits behind a Protocol, so this module is fully testable with fakes.
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.claude import DecodedOrder, DecodeInput, Decoder
from app.integrations.storage import Storage, new_key
from app.integrations.whisper import Transcriber
from app.models import (
    Channel,
    Evidence,
    EvidenceKind,
    Flag,
    FlagKind,
    Notification,
    Order,
    OrderLine,
    OrderStatus,
    Product,
    Retailer,
    ReviewState,
)
from app.services import orders as order_svc

log = logging.getLogger(__name__)


@dataclass
class Signal:
    """What the retailer sent, before any interpretation."""

    from_number: str
    text: str | None = None
    audio: tuple[bytes, str] | None = None
    image: tuple[bytes, str] | None = None
    raw: dict | None = None


@dataclass
class Providers:
    storage: Storage
    transcriber: Transcriber
    decoder: Decoder


async def decode_signal(db: AsyncSession, business_id: uuid.UUID, signal: Signal, providers: Providers) -> Order:
    retailer = await db.scalar(
        select(Retailer).where(Retailer.business_id == business_id, Retailer.phone == signal.from_number)
    )
    channel = Channel.voice if signal.audio else Channel.photo if signal.image else Channel.text
    order = Order(
        business_id=business_id,
        number=await order_svc.next_order_number(db, business_id),
        retailer_id=retailer.id if retailer else None,
        channel=channel,
        status=OrderStatus.processing,
        lines=[],
        flags=[],
        evidence=[],
    )
    db.add(order)
    await db.flush()

    # 1. Ingest: store every original signal untouched.
    if signal.text:
        order.evidence.append(
            Evidence(order_id=order.id, kind=EvidenceKind.text, text=signal.text, raw_payload=signal.raw or {})
        )
    if signal.audio:
        content, mime = signal.audio
        key = new_key(business_id, "voice", mime)
        await providers.storage.put(key, content, mime)
        order.evidence.append(
            Evidence(
                order_id=order.id, kind=EvidenceKind.voice, storage_key=key, mime=mime, raw_payload=signal.raw or {}
            )
        )
    if signal.image:
        content, mime = signal.image
        key = new_key(business_id, "photo", mime)
        await providers.storage.put(key, content, mime)
        order.evidence.append(
            Evidence(
                order_id=order.id, kind=EvidenceKind.photo, storage_key=key, mime=mime, raw_payload=signal.raw or {}
            )
        )
    await db.flush()

    products = (await db.execute(select(Product).where(Product.business_id == business_id))).scalars().all()
    catalog = [
        {"sku": p.sku, "name": p.name, "unit": p.unit, "price": str(p.price), "aliases": p.aliases or []}
        for p in products
    ]

    # 2. Transcribe voice notes. The transcript is its own evidence row and is never edited afterwards.
    transcript = None
    if signal.audio:
        transcript = await providers.transcriber.transcribe(
            signal.audio[0], signal.audio[1], [p.name for p in products]
        )
        order.evidence.append(Evidence(order_id=order.id, kind=EvidenceKind.transcript, text=transcript))
        await db.flush()

    # 3. Extract with Claude.
    recent = await _recent_skus(db, retailer)
    decoded = await providers.decoder.decode(
        DecodeInput(
            catalog=catalog,
            retailer_name=retailer.name if retailer else None,
            recent_skus=recent,
            transcript=transcript,
            text=signal.text,
            image=signal.image,
        )
    )
    if retailer is None and decoded.retailer_guess:
        order.retailer_name_guess = decoded.retailer_guess

    # 4. Persist lines and flags.
    _apply(order, decoded, {p.sku: p for p in products})
    order_svc.recompute(order)
    await db.flush()

    # 5. Notify.
    open_flags = len(order.flags)
    who = retailer.name if retailer else signal.from_number
    db.add(
        Notification(
            business_id=business_id,
            kind="flag" if open_flags else "order",
            order_id=order.id,
            title=f"{order.number} needs your eye" if open_flags else f"{order.number} decoded from {who}",
            detail=(
                f"Sabi flagged {open_flags} item{'s' if open_flags != 1 else ''} "
                f"on the {channel.value} order from {who}"
                if open_flags
                else f"{len(order.lines)} lines, ₦{order.subtotal:,.0f}"
            ),
        )
    )
    await db.flush()
    return order


def _apply(order: Order, decoded: DecodedOrder, by_sku: dict[str, Product]) -> None:
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
