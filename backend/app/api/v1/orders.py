import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentTenant, Tenant, require
from app.models import FlagStatus, Order, OrderStatus, Retailer
from app.schemas.catalog import Page
from app.schemas.orders import (
    ConfirmRequest,
    EvidenceOut,
    LineOut,
    LinesReplace,
    OrderCreate,
    OrderDetail,
    OrderSummary,
)
from app.services import orders as svc

router = APIRouter(prefix="/orders", tags=["orders"])
Writer = Annotated[Tenant, Depends(require("orders:write"))]


def to_detail(order: Order) -> OrderDetail:
    detail = OrderDetail.model_validate(order)
    detail.item_count = sum(line.quantity for line in order.lines)
    detail.open_flags = sum(1 for f in order.flags if f.status != FlagStatus.resolved)
    detail.evidence = [EvidenceOut.model_validate(e) for e in order.evidence]
    for ev, row in zip(detail.evidence, order.evidence, strict=True):
        if row.storage_key:
            ev.url = f"/api/v1/media/{row.storage_key}"
    return detail


async def load(db, tenant: Tenant, ref: str) -> Order:
    try:
        return await svc.get_order(db, tenant.business_id, ref)
    except svc.OrderError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.get("", response_model=Page[OrderSummary])
async def list_orders(
    db: DB,
    tenant: CurrentTenant,
    q: str | None = None,
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(le=200)] = 50,
    offset: int = 0,
) -> Page[OrderSummary]:
    stmt = svc.order_query().where(Order.business_id == tenant.business_id)
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    if q:
        like = f"%{q.lower().lstrip('#')}%"
        stmt = stmt.outerjoin(Retailer, Retailer.id == Order.retailer_id).where(
            or_(
                func.lower(Order.number).like(like),
                func.lower(Retailer.name).like(like),
                func.lower(Retailer.market).like(like),
            )
        )
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = (
        (await db.execute(stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset))).scalars().unique().all()
    )
    items = []
    for order in rows:
        s = OrderSummary.model_validate(order)
        s.item_count = sum(line.quantity for line in order.lines)
        s.open_flags = sum(1 for f in order.flags if f.status != FlagStatus.resolved)
        items.append(s)
    return Page(items=items, total=total or 0)


@router.post("", response_model=OrderDetail, status_code=status.HTTP_201_CREATED)
async def create_order(data: OrderCreate, db: DB, tenant: Writer) -> OrderDetail:
    try:
        await svc.retailer_for(db, tenant.business_id, data.retailer_id)
        order = await svc.create_manual_order(
            db, tenant.business_id, tenant.user.id, data.retailer_id, [ln.model_dump() for ln in data.lines]
        )
    except svc.OrderError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return to_detail(order)


@router.get("/{ref}", response_model=OrderDetail)
async def get_order(ref: str, db: DB, tenant: CurrentTenant) -> OrderDetail:
    return to_detail(await load(db, tenant, ref))


@router.patch("/{ref}/lines", response_model=OrderDetail)
async def replace_lines(ref: str, data: LinesReplace, db: DB, tenant: Writer) -> OrderDetail:
    order = await load(db, tenant, ref)
    if order.status in (OrderStatus.paid, OrderStatus.cancelled):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This order can no longer be edited")
    await svc.replace_lines(db, order, [ln.model_dump() for ln in data.lines])
    svc.recompute(order)
    await db.commit()
    return to_detail(await load(db, tenant, ref))


@router.post("/{ref}/lines/{line_id}/review", response_model=LineOut)
async def toggle_line_review(ref: str, line_id: uuid.UUID, db: DB, tenant: Writer) -> LineOut:
    order = await load(db, tenant, ref)
    line = next((ln for ln in order.lines if ln.id == line_id), None)
    if line is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Line not found")
    svc.toggle_review(line)
    svc.recompute(order)
    await db.commit()
    return LineOut.model_validate(line)


@router.post("/{ref}/confirm", response_model=OrderDetail)
async def confirm_order(ref: str, data: ConfirmRequest, db: DB, tenant: Writer) -> OrderDetail:
    order = await load(db, tenant, ref)
    try:
        await svc.confirm(db, order, force=data.force)
    except svc.OrderError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    from app.services import ledger as ledger_svc  # local import: ledger lands in the payments phase

    await ledger_svc.post_invoice(db, order)
    from app.integrations.whatsapp import get_whatsapp

    await get_whatsapp().send_order_confirmation(order)
    await db.commit()
    return to_detail(await load(db, tenant, ref))


@router.post("/{ref}/cancel", response_model=OrderDetail)
async def cancel_order(ref: str, db: DB, tenant: Writer) -> OrderDetail:
    order = await load(db, tenant, ref)
    if order.status == OrderStatus.paid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paid orders cannot be cancelled")
    order.status = OrderStatus.cancelled
    await db.commit()
    return to_detail(order)
