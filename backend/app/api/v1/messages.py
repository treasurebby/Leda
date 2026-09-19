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
    direction: str  # in | out
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
        raw_text = payload.get("text")
        text = raw_text.get("body") if isinstance(raw_text, dict) else raw_text
        direction = "out" if m.kind == "outbound" else "in"
        if direction == "out":
            outcome = "sent"
        elif m.error:
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
                direction=direction,
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


class SendMessage(BaseModel):
    to: str
    text: str


@router.post("/messages/send", response_model=MessageOut, status_code=201)
async def send_message(data: SendMessage, db: DB, tenant: CurrentTenant) -> MessageOut:
    """A person on the team replies by hand. Same number, same thread as Sabi's automatic replies."""
    from app.core.security import normalise_phone
    from app.integrations.whatsapp import get_whatsapp
    from app.services.reply import send_and_log

    to = normalise_phone(data.to) or (data.to if data.to.startswith("+") else None)
    text = data.text.strip()
    if not to or not text:
        from fastapi import HTTPException

        raise HTTPException(422, "A valid phone number and a message are required")
    await send_and_log(db, get_whatsapp(), tenant.business_id, to, text, sent_by=tenant.user.id)
    await db.commit()
    rows = await list_messages(db, tenant, limit=1)
    return rows[0]
