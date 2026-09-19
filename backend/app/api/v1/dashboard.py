import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.db import utcnow
from app.core.deps import DB, CurrentTenant
from app.models import Flag, FlagStatus, Notification, Order, OrderStatus, Payment, PaymentStatus
from app.schemas.common import Message
from app.schemas.orders import DashboardSummary, NotificationOut
from app.services import ledger as ledger_svc

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def summary(db: DB, tenant: CurrentTenant) -> DashboardSummary:
    biz = tenant.business_id
    now = utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)

    async def count_orders(start, end):
        return (
            await db.scalar(
                select(func.count())
                .select_from(Order)
                .where(
                    Order.business_id == biz,
                    Order.created_at >= start,
                    Order.created_at < end,
                    Order.status != OrderStatus.cancelled,
                )
            )
            or 0
        )

    ai_flags = (
        await db.scalar(
            select(func.count())
            .select_from(Flag)
            .join(Order, Order.id == Flag.order_id)
            .where(Order.business_id == biz, Flag.status == FlagStatus.open)
        )
        or 0
    )
    transfers = (
        await db.scalar(
            select(func.count())
            .select_from(Payment)
            .where(Payment.business_id == biz, Payment.status == PaymentStatus.review)
        )
        or 0
    )
    invoiced, collected = await ledger_svc.business_totals(db, biz)
    return DashboardSummary(
        orders_today=await count_orders(today, today + timedelta(days=1)),
        orders_yesterday=await count_orders(yesterday, today),
        pending_verifications=ai_flags + transfers,
        verification_breakdown={"ai_flag": ai_flags, "transfer": transfers, "duplicate": 0},
        receivables=invoiced - collected,
        invoiced=invoiced,
        collected=collected,
    )


@router.get("/notifications", response_model=list[NotificationOut])
async def notifications(db: DB, tenant: CurrentTenant, unread_only: bool = False) -> list[NotificationOut]:
    stmt = select(Notification).where(Notification.business_id == tenant.business_id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = (await db.execute(stmt.order_by(Notification.created_at.desc()).limit(50))).scalars().all()
    return [NotificationOut.model_validate(n) for n in rows]


@router.post("/notifications/{notification_id}/read", response_model=Message)
async def mark_read(notification_id: uuid.UUID, db: DB, tenant: CurrentTenant) -> Message:
    n = await db.get(Notification, notification_id)
    if n is None or n.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.read_at = utcnow()
    await db.commit()
    return Message(detail="Marked read")


@router.post("/notifications/read-all", response_model=Message)
async def mark_all_read(db: DB, tenant: CurrentTenant) -> Message:
    rows = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.business_id == tenant.business_id, Notification.read_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    for n in rows:
        n.read_at = utcnow()
    await db.commit()
    return Message(detail=f"{len(rows)} marked read")
