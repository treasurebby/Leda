"""Turns a bank credit (Paystack charge.success) into a Payment and, when unambiguous, a matched order.

Idempotent on (provider, reference): replaying the same event is a no-op.
"""

import re
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.models import Notification, Order, OrderStatus, Payment, PaymentStatus, Retailer
from app.services import ledger as ledger_svc

ORDER_REF = re.compile(r"LE-?(\d{3,})", re.I)


class ReconcileError(Exception):
    pass


async def record_credit(
    db: AsyncSession,
    business_id: uuid.UUID,
    *,
    provider: str,
    reference: str,
    amount: Decimal,
    received_at: datetime | None,
    account_number: str | None,
    narration: str | None,
    raw: dict,
) -> Payment | None:
    """Returns the Payment, or None if this reference was already processed."""
    existing = await db.scalar(
        select(Payment).where(Payment.provider == provider, Payment.provider_reference == reference)
    )
    if existing is not None:
        return None

    retailer = None
    if account_number:
        retailer = await db.scalar(
            select(Retailer).where(Retailer.business_id == business_id, Retailer.dva_account_number == account_number)
        )

    payment = Payment(
        business_id=business_id,
        retailer_id=retailer.id if retailer else None,
        provider=provider,
        provider_reference=reference,
        amount=amount,
        received_at=received_at or utcnow(),
        status=PaymentStatus.review,
        raw_event=raw,
    )
    db.add(payment)
    await db.flush()

    order = await _find_order(db, business_id, retailer, amount, narration or "")
    if order is not None:
        await match(db, payment, order, user_id=None)
        payment.detail = f"Matched to {order.number}"
    else:
        payment.detail = _review_reason(retailer, amount)
    db.add(
        Notification(
            business_id=business_id,
            kind="payment",
            order_id=order.id if order else None,
            title=f"₦{amount:,.0f} {'matched to ' + order.number if order else 'needs review'}",
            detail=(retailer.name if retailer else "Unknown sender")
            + (" · transfer reconciled" if order else " · " + payment.detail),
        )
    )
    await db.flush()
    return payment


def _review_reason(retailer: Retailer | None, amount: Decimal) -> str:
    if retailer is None:
        return "Sender not linked to a retailer"
    return "Amount does not match a single pending order"


async def _find_order(
    db: AsyncSession, business_id: uuid.UUID, retailer: Retailer | None, amount: Decimal, narration: str
) -> Order | None:
    """Auto-match only when it is unambiguous: an order number in the narration, or exactly one pending order
    for this retailer with the same amount."""
    pending = select(Order).where(Order.business_id == business_id, Order.status == OrderStatus.pending)
    m = ORDER_REF.search(narration)
    if m:
        order = await db.scalar(pending.where(Order.number == f"LE-{m.group(1)}"))
        if order is not None and order.subtotal == amount:
            return order
    if retailer is not None:
        candidates = (
            (await db.execute(pending.where(Order.retailer_id == retailer.id, Order.subtotal == amount)))
            .scalars()
            .all()
        )
        if len(candidates) == 1:
            return candidates[0]
    return None


async def match(db: AsyncSession, payment: Payment, order: Order, user_id: uuid.UUID | None) -> None:
    if payment.status == PaymentStatus.matched:
        raise ReconcileError("This payment is already matched")
    if order.status == OrderStatus.paid:
        raise ReconcileError(f"{order.number} is already paid")
    if order.status != OrderStatus.pending:
        raise ReconcileError(f"{order.number} has not been confirmed yet")
    payment.order_id = order.id
    payment.retailer_id = payment.retailer_id or order.retailer_id
    payment.status = PaymentStatus.matched
    payment.detail = f"Matched to {order.number}"
    await ledger_svc.post_payment(db, payment, order, user_id)
    if payment.amount >= order.subtotal:
        order.status = OrderStatus.paid
        order.paid_at = utcnow()
    await db.flush()


async def unmatch(db: AsyncSession, payment: Payment, user_id: uuid.UUID | None) -> None:
    if payment.status != PaymentStatus.matched or payment.order_id is None:
        raise ReconcileError("This payment is not matched")
    order = await db.get(Order, payment.order_id)
    await ledger_svc.post_reversal(db, payment, order, user_id)
    if order is not None and order.status == OrderStatus.paid:
        order.status = OrderStatus.pending
        order.paid_at = None
    payment.order_id = None
    payment.status = PaymentStatus.review
    payment.detail = "Unmatched; needs review"
    await db.flush()
