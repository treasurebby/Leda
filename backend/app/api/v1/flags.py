import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentTenant, Tenant, require
from app.models import Flag, FlagStatus, Order
from app.schemas.orders import FlagWithOrder, ResolveFlag
from app.services import orders as svc

router = APIRouter(prefix="/flags", tags=["flags"])
Writer = Annotated[Tenant, Depends(require("orders:write"))]


def _with_order(flag: Flag, order: Order) -> FlagWithOrder:
    out = FlagWithOrder.model_validate(
        {
            **{c.name: getattr(flag, c.name) for c in Flag.__table__.columns},
            "order_number": order.number,
            "retailer_name": order.retailer.name if order.retailer else order.retailer_name_guess,
        }
    )
    return out


@router.get("", response_model=list[FlagWithOrder])
async def list_flags(
    db: DB, tenant: CurrentTenant, status_filter: Annotated[FlagStatus | None, Query(alias="status")] = FlagStatus.open
) -> list[FlagWithOrder]:
    stmt = (
        select(Flag, Order)
        .join(Order, Order.id == Flag.order_id)
        .options(selectinload(Order.retailer))
        .where(Order.business_id == tenant.business_id)
        .order_by(Flag.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(Flag.status == status_filter)
    rows = (await db.execute(stmt)).all()
    return [_with_order(f, o) for f, o in rows]


async def _load(db, tenant: Tenant, flag_id: uuid.UUID) -> tuple[Flag, Order]:
    flag = await db.get(Flag, flag_id)
    if flag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found")
    try:
        order = await svc.get_order(db, tenant.business_id, flag.order_id)
    except svc.OrderError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found") from exc
    return flag, order


@router.post("/{flag_id}/resolve", response_model=FlagWithOrder)
async def resolve(flag_id: uuid.UUID, data: ResolveFlag, db: DB, tenant: Writer) -> FlagWithOrder:
    flag, order = await _load(db, tenant, flag_id)
    try:
        await svc.resolve_flag(db, order, flag, data.option_index, tenant.user.id)
    except svc.OrderError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return _with_order(flag, order)


@router.post("/{flag_id}/ask-retailer", response_model=FlagWithOrder)
async def ask_retailer(flag_id: uuid.UUID, db: DB, tenant: Writer) -> FlagWithOrder:
    flag, order = await _load(db, tenant, flag_id)
    if flag.status == FlagStatus.resolved:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This flag is already resolved")
    from app.integrations.whatsapp import get_whatsapp

    await get_whatsapp().ask_retailer(order, flag)
    flag.status = FlagStatus.asked_retailer
    await db.commit()
    return _with_order(flag, order)


@router.post("/{flag_id}/reopen", response_model=FlagWithOrder)
async def reopen(flag_id: uuid.UUID, db: DB, tenant: Writer) -> FlagWithOrder:
    flag, order = await _load(db, tenant, flag_id)
    await svc.reopen_flag(order, flag)
    await db.commit()
    return _with_order(flag, order)
