"""Append-only ledger. Invoices debit the retailer's account; payments credit it."""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LedgerEntry, LedgerKind, Order, Payment


async def post_invoice(db: AsyncSession, order: Order, user_id: uuid.UUID | None = None) -> LedgerEntry:
    entry = LedgerEntry(
        business_id=order.business_id,
        retailer_id=order.retailer_id,
        order_id=order.id,
        kind=LedgerKind.invoice,
        debit=order.subtotal,
        credit=Decimal("0"),
        memo=f"Invoice raised for {order.number}",
        created_by=user_id,
    )
    db.add(entry)
    await db.flush()
    return entry


async def post_payment(db: AsyncSession, payment: Payment, order: Order | None, user_id: uuid.UUID | None = None):
    entry = LedgerEntry(
        business_id=payment.business_id,
        retailer_id=payment.retailer_id or (order.retailer_id if order else None),
        order_id=order.id if order else None,
        payment_id=payment.id,
        kind=LedgerKind.payment,
        debit=Decimal("0"),
        credit=payment.amount,
        memo=f"Payment received{' for ' + order.number if order else ''}",
        created_by=user_id,
    )
    db.add(entry)
    await db.flush()
    return entry


async def post_reversal(db: AsyncSession, payment: Payment, order: Order | None, user_id: uuid.UUID | None = None):
    """Unmatching a payment: never delete the original credit, post an offsetting debit."""
    entry = LedgerEntry(
        business_id=payment.business_id,
        retailer_id=order.retailer_id if order else payment.retailer_id,
        order_id=order.id if order else None,
        payment_id=payment.id,
        kind=LedgerKind.adjustment,
        debit=payment.amount,
        credit=Decimal("0"),
        memo=f"Payment unmatched{' from ' + order.number if order else ''}",
        created_by=user_id,
    )
    db.add(entry)
    await db.flush()
    return entry


async def retailer_balance(db: AsyncSession, business_id: uuid.UUID, retailer_id: uuid.UUID) -> Decimal:
    value = await db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
            LedgerEntry.business_id == business_id, LedgerEntry.retailer_id == retailer_id
        )
    )
    return Decimal(str(value or 0))


async def business_totals(db: AsyncSession, business_id: uuid.UUID) -> tuple[Decimal, Decimal]:
    """(invoiced, collected) across the business."""
    invoiced = await db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.debit), 0)).where(
            LedgerEntry.business_id == business_id, LedgerEntry.kind == LedgerKind.invoice
        )
    )
    collected = await db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.credit), 0)).where(
            LedgerEntry.business_id == business_id, LedgerEntry.kind == LedgerKind.payment
        )
    )
    return Decimal(str(invoiced or 0)), Decimal(str(collected or 0))
