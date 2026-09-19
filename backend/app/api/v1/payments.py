import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.core.deps import DB, CurrentTenant, Tenant, require
from app.models import Order, Payment, PaymentStatus, Retailer
from app.schemas.catalog import Page
from app.schemas.payments import MatchRequest, PaymentOut
from app.services import orders as order_svc
from app.services import reconcile

router = APIRouter(prefix="/payments", tags=["payments"])
Writer = Annotated[Tenant, Depends(require("payments:write"))]


def _out(p: Payment, retailer: Retailer | None, order: Order | None) -> PaymentOut:
    out = PaymentOut.model_validate(p)
    out.retailer_name = retailer.name if retailer else None
    out.order_number = order.number if order else None
    return out


def _base(business_id: uuid.UUID):
    r, o = aliased(Retailer), aliased(Order)
    stmt = (
        select(Payment, r, o)
        .outerjoin(r, r.id == Payment.retailer_id)
        .outerjoin(o, o.id == Payment.order_id)
        .where(Payment.business_id == business_id)
    )
    return stmt, r, o


@router.get("", response_model=Page[PaymentOut])
async def list_payments(
    db: DB,
    tenant: CurrentTenant,
    status_filter: Annotated[PaymentStatus | None, Query(alias="status")] = None,
    q: str | None = None,
    limit: Annotated[int, Query(le=200)] = 50,
    offset: int = 0,
) -> Page[PaymentOut]:
    stmt, r, o = _base(tenant.business_id)
    if status_filter:
        stmt = stmt.where(Payment.status == status_filter)
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func, or_

        stmt = stmt.where(
            or_(
                func.lower(Payment.provider_reference).like(like),
                func.lower(r.name).like(like),
                func.lower(o.number).like(like),
            )
        )
    rows = (await db.execute(stmt.order_by(Payment.created_at.desc()).limit(limit).offset(offset))).all()
    from sqlalchemy import func

    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    return Page(items=[_out(p, rr, oo) for p, rr, oo in rows], total=total or 0)


async def _load(db, tenant: Tenant, payment_id: uuid.UUID) -> Payment:
    p = await db.get(Payment, payment_id)
    if p is None or p.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return p


@router.post("/{payment_id}/match", response_model=PaymentOut)
async def match_payment(payment_id: uuid.UUID, data: MatchRequest, db: DB, tenant: Writer) -> PaymentOut:
    payment = await _load(db, tenant, payment_id)
    try:
        order = await order_svc.get_order(db, tenant.business_id, data.order_id)
        await reconcile.match(db, payment, order, tenant.user.id)
    except (order_svc.OrderError, reconcile.ReconcileError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    retailer = await db.get(Retailer, payment.retailer_id) if payment.retailer_id else None
    return _out(payment, retailer, order)


@router.post("/{payment_id}/unmatch", response_model=PaymentOut)
async def unmatch_payment(payment_id: uuid.UUID, db: DB, tenant: Writer) -> PaymentOut:
    payment = await _load(db, tenant, payment_id)
    try:
        await reconcile.unmatch(db, payment, tenant.user.id)
    except reconcile.ReconcileError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    retailer = await db.get(Retailer, payment.retailer_id) if payment.retailer_id else None
    return _out(payment, retailer, None)
