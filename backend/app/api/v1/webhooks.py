"""Inbound webhooks. Verify, acknowledge fast, hand the work to the right service."""

import logging
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.db import get_session_factory
from app.integrations import paystack, whatsapp
from app.models import Business, Order, Retailer
from app.services import reconcile

log = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/paystack", status_code=status.HTTP_200_OK)
async def paystack_webhook(
    request: Request,
    session_factory: Annotated[object, Depends(get_session_factory)],
    x_paystack_signature: Annotated[str | None, Header()] = None,
):
    body = await request.body()
    if not paystack.verify_signature(settings.paystack_secret_key, body, x_paystack_signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad signature")
    event = await request.json()
    if event.get("event") != "charge.success":
        return {"ok": True, "ignored": event.get("event")}
    data = event.get("data", {})
    amount = Decimal(str(data.get("amount", 0))) / 100  # Paystack amounts are in kobo
    auth = data.get("authorization", {}) or {}
    account_number = auth.get("receiver_bank_account_number") or (data.get("metadata") or {}).get(
        "receiver_account_number"
    )
    async with session_factory() as db:  # type: ignore[operator]
        business_id = await _business_for(db, account_number, data.get("narration") or "")
        if business_id is None:
            log.warning("paystack credit %s could not be routed to a business", data.get("reference"))
            return {"ok": True, "routed": False}
        await reconcile.record_credit(
            db,
            business_id,
            provider="paystack",
            reference=str(data.get("reference")),
            amount=amount,
            received_at=None,
            account_number=account_number,
            narration=data.get("narration"),
            raw=event,
        )
        await db.commit()
    return {"ok": True}


async def _business_for(db, account_number: str | None, narration: str):
    if account_number:
        retailer = await db.scalar(select(Retailer).where(Retailer.dva_account_number == account_number))
        if retailer:
            return retailer.business_id
    m = reconcile.ORDER_REF.search(narration)
    if m:
        order = await db.scalar(select(Order).where(Order.number == f"LE-{m.group(1)}"))
        if order:
            return order.business_id
    # Single-tenant fallback: if there is exactly one business, it must be theirs.
    businesses = (await db.execute(select(Business.id).limit(2))).scalars().all()
    return businesses[0] if len(businesses) == 1 else None


@router.get("/whatsapp")
async def whatsapp_verify(request: Request):
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == settings.whatsapp_verify_token:
        return PlainTextResponse(params.get("hub.challenge", ""))
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Verification failed")


@router.post("/whatsapp")
async def whatsapp_webhook(
    request: Request,
    tasks: BackgroundTasks,
    session_factory: Annotated[object, Depends(get_session_factory)],
    x_hub_signature_256: Annotated[str | None, Header()] = None,
):
    body = await request.body()
    if not whatsapp.verify_signature(settings.whatsapp_app_secret, body, x_hub_signature_256):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad signature")
    payload = await request.json()
    from app.jobs.decode_job import handle_inbound

    for message in whatsapp.parse_inbound(payload):
        tasks.add_task(handle_inbound, message, session_factory)
    return {"ok": True}
