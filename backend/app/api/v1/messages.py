"""The builder's view of the WhatsApp conversation: what came in, what Sabi did with it, what Leda replied."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DB, CurrentTenant
from app.models import Order, Retailer, WhatsAppMessage

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


class MessageOut(BaseModel):
    id: uuid.UUID
    wa_message_id: str
    from_number: str
    sender_name: str | None
    kind: str
    text: str | None
    received_at: datetime
    outcome: str  # order | question-answered | catalog | ignored | error
    error: str | None
    order_id: uuid.UUID | None
    order_number: str | None
    order_status: str | None
    reply_text: str | None


@router.get("/messages", response_model=list[MessageOut])
async def list_messages(
    db: DB, tenant: CurrentTenant, limit: Annotated[int, Query(le=200)] = 50, offset: int = 0
) -> list[MessageOut]:
    rows = (
        await db.execute(
            select(WhatsAppMessage, Order, Retailer)
            .outerjoin(Order, Order.id == WhatsAppMessage.order_id)
            .outerjoin(
                Retailer, (Retailer.phone == WhatsAppMessage.from_number) & (Retailer.business_id == tenant.business_id)
            )
            .where(WhatsAppMessage.business_id == tenant.business_id)
            .order_by(WhatsAppMessage.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    out: list[MessageOut] = []
    for m, order, retailer in rows:
        payload = m.payload or {}
        text = (payload.get("text") or {}).get("body") if isinstance(payload.get("text"), dict) else payload.get("text")
        if m.error:
            outcome = "error"
        elif order is not None:
            outcome = "order"
        elif m.kind == "text" and (text or "").strip().isdigit():
            outcome = "question-answered"
        else:
            outcome = "catalog-or-inquiry"
        out.append(
            MessageOut(
                id=m.id,
                wa_message_id=m.wa_message_id,
                from_number=m.from_number,
                sender_name=retailer.name if retailer else None,
                kind=m.kind,
                text=text,
                received_at=m.created_at,
                outcome=outcome,
                error=m.error,
                order_id=order.id if order else None,
                order_number=order.number if order else None,
                order_status=order.status.value if order else None,
                reply_text=order.reply_text if order else None,
            )
        )
    return out
