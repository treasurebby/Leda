"""Dev-only helpers that stand in for Paystack and WhatsApp so the whole pipeline can be exercised locally.
Mounted only when APP_ENV != prod."""

import secrets
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status

from app.core.db import get_session_factory
from app.core.deps import DB, CurrentTenant
from app.integrations.whatsapp import InboundMessage
from app.models import Order, Retailer
from app.schemas.common import Message
from app.schemas.payments import PaymentOut, SimulateCredit
from app.services import reconcile

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/simulate/paystack-credit", response_model=PaymentOut | Message)
async def simulate_credit(data: SimulateCredit, db: DB, tenant: CurrentTenant):
    account_number = data.account_number
    if data.retailer_id and not account_number:
        retailer = await db.get(Retailer, data.retailer_id)
        if retailer is None or retailer.business_id != tenant.business_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Retailer not found")
        account_number = retailer.dva_account_number
    reference = data.reference or f"SIM-{secrets.token_hex(4).upper()}"
    payment = await reconcile.record_credit(
        db,
        tenant.business_id,
        provider="paystack",
        reference=reference,
        amount=Decimal(data.amount),
        received_at=None,
        account_number=account_number,
        narration=data.narration,
        raw={"event": "charge.success", "simulated": True},
    )
    await db.commit()
    if payment is None:
        return Message(detail=f"Reference {reference} was already processed; nothing changed")
    out = PaymentOut.model_validate(payment)
    if payment.retailer_id:
        retailer = await db.get(Retailer, payment.retailer_id)
        out.retailer_name = retailer.name if retailer else None
    if payment.order_id:
        order = await db.get(Order, payment.order_id)
        out.order_number = order.number if order else None
    return out


@router.post("/simulate/whatsapp", response_model=Message, status_code=status.HTTP_202_ACCEPTED)
async def simulate_whatsapp(
    tasks: BackgroundTasks,
    tenant: CurrentTenant,
    session_factory: Annotated[object, Depends(get_session_factory)],
    from_number: Annotated[str, Form()],
    text: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> Message:
    """Pretend a retailer sent a text, voice note (audio/*) or photo (image/*) to this business's number."""
    from app.jobs.decode_job import handle_inbound

    msg = InboundMessage(wa_message_id=f"sim.{secrets.token_hex(8)}", from_number=from_number, kind="text", text=text)
    if file is not None:
        content = await file.read()
        mime = file.content_type or "application/octet-stream"
        msg.kind = "audio" if mime.startswith("audio/") else "image" if mime.startswith("image/") else "other"
        msg.mime = mime
        msg.raw = {"inline_media": content}
    tasks.add_task(handle_inbound, msg, session_factory, tenant.business_id)
    return Message(detail=f"Queued {msg.kind} message {msg.wa_message_id}")
