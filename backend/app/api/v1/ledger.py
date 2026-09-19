import csv
import io
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import aliased

from app.core.deps import DB, Tenant, require
from app.models import LedgerEntry, Order, Retailer
from app.schemas.payments import BalanceOut, LedgerEntryOut, LedgerPage
from app.services import ledger as ledger_svc

router = APIRouter(tags=["ledger"])
Reader = Annotated[Tenant, Depends(require("ledger:read"))]


async def _rows(db, business_id, retailer_id, start, end):
    r, o = aliased(Retailer), aliased(Order)
    stmt = (
        select(LedgerEntry, r.name, o.number)
        .outerjoin(r, r.id == LedgerEntry.retailer_id)
        .outerjoin(o, o.id == LedgerEntry.order_id)
        .where(LedgerEntry.business_id == business_id)
    )
    opening_stmt = select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
        LedgerEntry.business_id == business_id
    )
    if retailer_id:
        stmt = stmt.where(LedgerEntry.retailer_id == retailer_id)
        opening_stmt = opening_stmt.where(LedgerEntry.retailer_id == retailer_id)
    if start:
        stmt = stmt.where(LedgerEntry.created_at >= start)
        opening_stmt = opening_stmt.where(LedgerEntry.created_at < start)
    else:
        opening_stmt = opening_stmt.where(False)  # noqa: E712 - no window start means opening balance is 0
    if end:
        stmt = stmt.where(LedgerEntry.created_at < end)
    opening = Decimal(str(await db.scalar(opening_stmt) or 0))
    rows = (await db.execute(stmt.order_by(LedgerEntry.created_at, LedgerEntry.id))).all()
    items: list[LedgerEntryOut] = []
    balance = opening
    for entry, retailer_name, order_number in rows:
        balance += entry.debit - entry.credit
        out = LedgerEntryOut.model_validate(
            {
                **{c.name: getattr(entry, c.name) for c in LedgerEntry.__table__.columns},
                "retailer_name": retailer_name,
                "order_number": order_number,
                "balance": balance,
            }
        )
        items.append(out)
    return items, opening, balance


@router.get("/ledger", response_model=LedgerPage)
async def ledger(
    db: DB,
    tenant: Reader,
    retailer_id: uuid.UUID | None = None,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
) -> LedgerPage:
    items, opening, closing = await _rows(db, tenant.business_id, retailer_id, start, end)
    return LedgerPage(items=items, opening_balance=opening, closing_balance=closing)


@router.get("/ledger/export.csv")
async def export_csv(
    db: DB,
    tenant: Reader,
    retailer_id: uuid.UUID | None = None,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
):
    items, _, _ = await _rows(db, tenant.business_id, retailer_id, start, end)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Entry", "Counterparty", "Reference", "Debit", "Credit", "Balance"])
    for it in items:
        w.writerow(
            [
                it.created_at.isoformat(),
                it.kind.value,
                _escape(it.retailer_name or ""),
                it.order_number or "",
                f"{it.debit:.2f}",
                f"{it.credit:.2f}",
                f"{it.balance:.2f}",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="leda-ledger.csv"'},
    )


def _escape(value: str) -> str:
    """Neutralise spreadsheet formula injection, like the frontend's escapeFormulae."""
    return "'" + value if value[:1] in ("=", "+", "-", "@") else value


@router.get("/retailers/{retailer_id}/balance", response_model=BalanceOut)
async def retailer_balance(retailer_id: uuid.UUID, db: DB, tenant: Reader) -> BalanceOut:
    retailer = await db.get(Retailer, retailer_id)
    if retailer is None or retailer.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Retailer not found")
    return BalanceOut(
        retailer_id=retailer_id, balance=await ledger_svc.retailer_balance(db, tenant.business_id, retailer_id)
    )
