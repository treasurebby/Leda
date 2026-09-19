"""Order lifecycle: numbering, totals, status derivation, line review, confirmation."""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import utcnow
from app.models import (
    Business,
    Channel,
    Flag,
    FlagStatus,
    Order,
    OrderLine,
    OrderStatus,
    Product,
    Retailer,
    ReviewState,
)

# Below this score a decoded line is marked "check" and the order needs review.
SURE_THRESHOLD = 85


class OrderError(Exception):
    pass


async def next_order_number(db: AsyncSession, business_id: uuid.UUID) -> str:
    """LE-1041 style numbers, unique per business. Row-locked on Postgres; SQLite serialises writes anyway."""
    stmt = select(Business).where(Business.id == business_id)
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update()
    business = (await db.execute(stmt)).scalar_one()
    number = business.next_order_number
    business.next_order_number = number + 1
    await db.flush()
    return f"LE-{number}"


def order_query():
    return select(Order).options(
        selectinload(Order.lines), selectinload(Order.evidence), selectinload(Order.flags), selectinload(Order.retailer)
    )


async def get_order(db: AsyncSession, business_id: uuid.UUID, ref: str | uuid.UUID) -> Order:
    """Accepts a UUID or a human number like LE-1041 / #LE-1041."""
    stmt = order_query().where(Order.business_id == business_id)
    if isinstance(ref, uuid.UUID):
        stmt = stmt.where(Order.id == ref)
    else:
        try:
            stmt = stmt.where(Order.id == uuid.UUID(ref))
        except ValueError:
            stmt = stmt.where(Order.number == ref.lstrip("#").upper())
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise OrderError("Order not found")
    return order


def recompute(order: Order) -> None:
    """Recalculate subtotal and derive status from lines and flags. Paid/pending orders keep their status."""
    order.subtotal = sum((line.unit_price * line.quantity for line in order.lines), Decimal("0"))
    if order.status in (OrderStatus.pending, OrderStatus.paid, OrderStatus.cancelled):
        return
    open_flags = any(f.status == FlagStatus.open for f in order.flags)
    unchecked = any(line.review_state == ReviewState.check for line in order.lines)
    order.status = OrderStatus.needs_review if (open_flags or unchecked) else OrderStatus.processing


def review_state_for(score: int) -> ReviewState:
    return ReviewState.sure if score >= SURE_THRESHOLD else ReviewState.check


async def create_manual_order(
    db: AsyncSession,
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    retailer_id: uuid.UUID | None,
    lines: list[dict],
) -> Order:
    order = Order(
        business_id=business_id,
        number=await next_order_number(db, business_id),
        retailer_id=retailer_id,
        channel=Channel.manual,
        owner_user_id=user_id,
        lines=[],
        flags=[],
        evidence=[],
    )
    db.add(order)
    await db.flush()
    await replace_lines(db, order, lines)
    recompute(order)
    await db.commit()
    return await get_order(db, business_id, order.id)


async def replace_lines(db: AsyncSession, order: Order, lines: list[dict]) -> None:
    """Bulk replace from the War Room table. Lines keep their ids when passed back so review state survives."""
    existing = {line.id: line for line in order.lines}
    products = {
        p.id: p for p in (await db.execute(select(Product).where(Product.business_id == order.business_id))).scalars()
    }
    new_lines: list[OrderLine] = []
    for position, data in enumerate(lines):
        product = products.get(data.get("product_id")) if data.get("product_id") else None
        line = existing.get(data.get("id")) if data.get("id") else None
        if line is None:
            line = OrderLine(order_id=order.id, confidence_score=100, review_state=ReviewState.verified)
        line.position = position
        if product is not None:
            line.product_id = product.id
        elif "product_id" in data and data["product_id"] is not None:
            line.product_id = data["product_id"]
        line.product_name = data.get("product_name") or (product.name if product else line.product_name or "")
        line.sku = data.get("sku") or (product.sku if product else line.sku)
        line.unit = data.get("unit") or (product.unit if product else line.unit)
        line.quantity = int(data["quantity"])
        line.unit_price = Decimal(str(data["unit_price"]))
        if "review_state" in data and data["review_state"]:
            line.review_state = ReviewState(data["review_state"])
        new_lines.append(line)
    order.lines = new_lines
    await db.flush()


def toggle_review(line: OrderLine) -> None:
    """Badge click in the War Room: check -> verified, sure/verified -> check."""
    line.review_state = ReviewState.verified if line.review_state == ReviewState.check else ReviewState.check


async def confirm(db: AsyncSession, order: Order, force: bool = False) -> Order:
    if order.status in (OrderStatus.pending, OrderStatus.paid):
        raise OrderError("This order has already been confirmed")
    if not order.lines:
        raise OrderError("Add at least one line before confirming")
    unresolved = [line for line in order.lines if line.review_state == ReviewState.check]
    open_flags = [f for f in order.flags if f.status == FlagStatus.open]
    if (unresolved or open_flags) and not force:
        raise OrderError("Resolve the items marked for review first, or confirm with force=true")
    if order.retailer_id is None:
        raise OrderError("Attach a retailer before confirming")
    for f in open_flags:
        f.status = FlagStatus.resolved
        f.resolved_at = utcnow()
    for line in unresolved:
        line.review_state = ReviewState.verified
    recompute(order)
    order.status = OrderStatus.pending
    order.confirmed_at = utcnow()
    # Reserve stock for confirmed lines.
    for line in order.lines:
        if line.product_id:
            product = await db.get(Product, line.product_id)
            if product:
                product.reserved += line.quantity
    await db.flush()
    return order


async def resolve_flag(db: AsyncSession, order: Order, flag: Flag, option_index: int, user_id: uuid.UUID) -> None:
    if flag.status == FlagStatus.resolved:
        raise OrderError("This flag is already resolved")
    if option_index < 0 or option_index >= len(flag.options):
        raise OrderError("Choose one of the offered options")
    option = flag.options[option_index]
    flag.status = FlagStatus.resolved
    flag.resolved_option = option
    flag.resolved_by = user_id
    flag.resolved_at = utcnow()

    # Apply the chosen option to the affected line: quantity and/or product.
    line = next((ln for ln in order.lines if ln.id == flag.line_id), None)
    if line is not None:
        if option.get("quantity") is not None:
            line.quantity = int(option["quantity"])
        if option.get("sku"):
            product = await db.scalar(
                select(Product).where(Product.business_id == order.business_id, Product.sku == option["sku"])
            )
            if product:
                line.product_id, line.product_name, line.sku, line.unit = (
                    product.id,
                    product.name,
                    product.sku,
                    product.unit,
                )
                line.unit_price = product.price
        line.review_state = ReviewState.verified
        line.confidence_score = 100
    recompute(order)
    await db.flush()


async def reopen_flag(order: Order, flag: Flag) -> None:
    flag.status = FlagStatus.open
    flag.resolved_option = None
    flag.resolved_by = None
    flag.resolved_at = None
    line = next((ln for ln in order.lines if ln.id == flag.line_id), None)
    if line is not None:
        line.review_state = ReviewState.check
    recompute(order)


async def retailer_for(db: AsyncSession, business_id: uuid.UUID, retailer_id: uuid.UUID | None) -> Retailer | None:
    if retailer_id is None:
        return None
    retailer = await db.get(Retailer, retailer_id)
    if retailer is None or retailer.business_id != business_id:
        raise OrderError("Retailer not found")
    return retailer
