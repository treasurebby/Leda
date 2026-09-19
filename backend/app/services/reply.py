"""Composes the WhatsApp message Leda sends straight back to a retailer after decoding what they sent.

The reply always says what was understood, never guesses at a price (prices come from the catalog), asks Sabi's
clarifying questions where a line is uncertain, and gives the retailer the account to pay into.
"""

import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.claude import DecodedOrder
from app.integrations.paystack import get_paystack
from app.integrations.whatsapp import WhatsAppClient
from app.models import Business, Flag, FlagStatus, Order, Product, Retailer, WhatsAppMessage

log = logging.getLogger(__name__)


async def send_and_log(
    db: AsyncSession, wa: WhatsAppClient, business_id, to: str, text: str, order_id=None, sent_by=None
) -> None:
    """Every outbound WhatsApp message is delivered and recorded, so the Messages page shows the whole thread."""
    await wa.send_text(to, text)
    db.add(
        WhatsAppMessage(
            business_id=business_id,
            wa_message_id=f"out.{uuid.uuid4().hex}",
            from_number=to,
            kind="outbound",
            payload={"text": text, "direction": "out", "sent_by": str(sent_by) if sent_by else "sabi"},
            order_id=order_id,
        )
    )
    await db.flush()


def naira(value: Decimal | int) -> str:
    return f"₦{Decimal(value):,.0f}"


async def ensure_retailer(db: AsyncSession, business: Business, phone: str, display_name: str | None) -> Retailer:
    """Unknown senders become retailers on the spot so they can be invoiced and paid."""
    retailer = await db.scalar(select(Retailer).where(Retailer.business_id == business.id, Retailer.phone == phone))
    if retailer is None:
        retailer = Retailer(business_id=business.id, name=(display_name or phone).strip()[:120], phone=phone)
        db.add(retailer)
        await db.flush()
    return retailer


async def ensure_virtual_account(db: AsyncSession, retailer: Retailer) -> None:
    """Provision the retailer's dedicated account if missing. Provider failures are logged, not fatal."""
    if retailer.dva_account_number:
        return
    try:
        email = retailer.email or f"{retailer.id.hex}@retailers.leda.africa"
        va = await get_paystack().create_virtual_account(email=email, name=retailer.name, phone=retailer.phone)
    except Exception:
        log.exception("could not create virtual account for retailer %s", retailer.id)
        return
    retailer.paystack_customer_code = va.customer_code
    retailer.dva_account_number = va.account_number
    retailer.dva_bank = va.bank_name
    retailer.account_reference = va.account_number
    await db.flush()


def payment_block(retailer: Retailer | None, reference: str) -> str:
    if retailer and retailer.dva_account_number:
        return (
            f"Pay by transfer to:\n{retailer.dva_bank or 'Bank'} {retailer.dva_account_number}\n"
            f"Account name: {retailer.name}\nReference: {reference}"
        )
    return f"Pay by transfer using reference {reference}. We'll send the account details shortly."


def compose_reply(
    business: Business,
    retailer: Retailer | None,
    order: Order | None,
    decoded: DecodedOrder,
    products: dict[str, Product],
) -> str:
    """Plain-text WhatsApp reply. Sections appear only when relevant."""
    parts: list[str] = []
    who = retailer.name if retailer and retailer.name and not retailer.name.startswith("+") else None
    parts.append(f"Hello{' ' + who if who else ''}, this is {business.name} on Leda.")

    # 1. Availability and prices for anything they asked about.
    answers: list[str] = []
    for q in decoded.inquiries:
        product = products.get(q.sku) if q.sku else None
        if product is None:
            answers.append(f"✗ {q.query.capitalize()}: not currently stocked.")
        elif product.available > 0:
            answers.append(
                f"✓ {product.name} ({product.unit or 'unit'}): {naira(product.price)} — {product.available} available."
            )
        else:
            answers.append(f"✗ {product.name}: out of stock right now.")
    for item in decoded.unmatched:
        if not any(q.query == item for q in decoded.inquiries):
            answers.append(f"✗ {item.capitalize()}: not currently stocked.")
    if answers:
        parts.append("\n".join(answers))

    # 2. The pro-forma for what they ordered.
    if order is not None and order.lines:
        rows = [
            f"• {ln.quantity} × {ln.product_name} ({ln.unit or 'unit'}) @ {naira(ln.unit_price)} "
            f"= {naira(ln.unit_price * ln.quantity)}"
            for ln in order.lines
        ]
        open_flags = [f for f in order.flags if f.status == FlagStatus.open]
        heading = f"Order {order.number} — here's what we understood:"
        parts.append(heading + "\n" + "\n".join(rows) + f"\nSubtotal: {naira(order.subtotal)}")
        if open_flags:
            parts.append(questions_block(open_flags))
        else:
            parts.append(payment_block(retailer, order.number))
        parts.append(
            "Reply with any changes and we'll update it."
            if not open_flags
            else "Once you answer, we'll send the final invoice and payment details."
        )
    elif decoded.intent == "other" and not answers:
        parts.append("Send us what you'd like to order — a voice note, a photo of your list, or a text all work.")
    elif answers:
        parts.append("Tell us the quantities you want and we'll send the invoice.")

    return "\n\n".join(parts)


def questions_block(flags: list[Flag]) -> str:
    lines = ["Quick check before we invoice:"]
    for i, f in enumerate(flags, start=1):
        opts = "  ".join(f"{j + 1}) {o.get('label')}" for j, o in enumerate(f.options))
        lines.append(f"{i}. {f.issue.split(' (')[0]} — {opts}")
    lines.append("Reply with the number of the right option.")
    return "\n".join(lines)


def invoice_reply(order: Order, retailer: Retailer | None) -> str:
    """Sent once every question is answered: the final amount and where to pay."""
    rows = [
        f"• {ln.quantity} × {ln.product_name} ({ln.unit or 'unit'}) = {naira(ln.unit_price * ln.quantity)}"
        for ln in order.lines
    ]
    return (
        f"Thanks — order {order.number} is updated:\n"
        + "\n".join(rows)
        + f"\nTotal: {naira(order.subtotal)}\n\n"
        + payment_block(retailer, order.number)
    )


async def open_question_for(db: AsyncSession, business_id, retailer_id) -> tuple[Order, Flag] | None:
    """The most recent flag we asked this retailer about, if any is still waiting for their answer."""
    from app.services.orders import order_query

    stmt = (
        order_query()
        .join(Flag, Flag.order_id == Order.id)
        .where(
            Order.business_id == business_id, Order.retailer_id == retailer_id, Flag.status == FlagStatus.asked_retailer
        )
        .order_by(Flag.created_at.desc())
    )
    order = (await db.execute(stmt)).scalars().first()
    if order is None:
        return None
    flag = next((f for f in order.flags if f.status == FlagStatus.asked_retailer), None)
    return (order, flag) if flag else None
