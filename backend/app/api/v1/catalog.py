"""The easy roads into the catalog: paste/snap/say a price list, and add what retailers keep asking for."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from app.core.deps import DB, CurrentTenant, Tenant, require
from app.integrations.claude import get_decoder
from app.integrations.whisper import get_transcriber
from app.models import CatalogDraft, ProductRequest, ProductRequestStatus
from app.schemas.catalog import (
    CatalogApply,
    CatalogDraftOut,
    CatalogExtractText,
    ProductOut,
    ProductRequestAdd,
    ProductRequestOut,
)
from app.schemas.common import Message
from app.services import catalog as svc

router = APIRouter(tags=["catalog"])
Writer = Annotated[Tenant, Depends(require("products:write"))]


def _out(draft: CatalogDraft, summary: str | None = None) -> CatalogDraftOut:
    out = CatalogDraftOut.model_validate(draft)
    out.summary = summary
    return out


@router.post("/catalog/extract", response_model=CatalogDraftOut, status_code=status.HTTP_201_CREATED)
async def extract_from_text(data: CatalogExtractText, db: DB, tenant: Writer) -> CatalogDraftOut:
    """Paste a price list; get back a draft to review and apply."""
    try:
        decoded = await svc.extract(get_decoder(), get_transcriber(), text=data.text)
    except svc.CatalogError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    draft = await svc.create_draft(db, tenant.business_id, "web", decoded)
    await db.commit()
    return _out(draft, decoded.summary)


@router.post("/catalog/extract-file", response_model=CatalogDraftOut, status_code=status.HTTP_201_CREATED)
async def extract_from_file(
    db: DB, tenant: Writer, file: Annotated[UploadFile, File()], text: Annotated[str | None, Form()] = None
) -> CatalogDraftOut:
    """Snap a photo of the price board, or send a voice note reading it."""
    content = await file.read()
    mime = file.content_type or "application/octet-stream"
    kwargs = (
        {"image": (content, mime)}
        if mime.startswith("image/")
        else {"audio": (content, mime)}
        if mime.startswith("audio/")
        else {}
    )
    if not kwargs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Send an image or an audio file")
    try:
        decoded = await svc.extract(get_decoder(), get_transcriber(), text=text, **kwargs)
    except svc.CatalogError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    draft = await svc.create_draft(db, tenant.business_id, "web", decoded)
    await db.commit()
    return _out(draft, decoded.summary)


async def _draft(db, tenant: Tenant, draft_id: uuid.UUID) -> CatalogDraft:
    draft = await db.get(CatalogDraft, draft_id)
    if draft is None or draft.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft not found")
    return draft


@router.get("/catalog/drafts/{draft_id}", response_model=CatalogDraftOut)
async def get_draft(draft_id: uuid.UUID, db: DB, tenant: CurrentTenant) -> CatalogDraftOut:
    return _out(await _draft(db, tenant, draft_id))


@router.post("/catalog/drafts/{draft_id}/apply", response_model=CatalogDraftOut)
async def apply_draft(draft_id: uuid.UUID, data: CatalogApply, db: DB, tenant: Writer) -> CatalogDraftOut:
    draft = await _draft(db, tenant, draft_id)
    try:
        items = [i.model_dump(mode="json") for i in data.items] if data.items is not None else None
        await svc.apply_draft(db, draft, items)
    except svc.CatalogError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return _out(draft)


@router.post("/catalog/drafts/{draft_id}/discard", response_model=Message)
async def discard_draft(draft_id: uuid.UUID, db: DB, tenant: Writer) -> Message:
    draft = await _draft(db, tenant, draft_id)
    await svc.discard_draft(db, draft)
    await db.commit()
    return Message(detail="Draft discarded")


# ------------------------------------------------------------------ what retailers asked for
@router.get("/product-requests", response_model=list[ProductRequestOut])
async def list_requests(
    db: DB, tenant: CurrentTenant, status_filter: Annotated[str | None, Query(alias="status")] = "open"
) -> list[ProductRequestOut]:
    stmt = select(ProductRequest).where(ProductRequest.business_id == tenant.business_id)
    if status_filter:
        stmt = stmt.where(ProductRequest.status == ProductRequestStatus(status_filter))
    rows = (
        await db.execute(stmt.order_by(ProductRequest.times_asked.desc(), ProductRequest.last_asked_at.desc()))
    ).scalars()
    return [ProductRequestOut.model_validate(r) for r in rows]


async def _request(db, tenant: Tenant, request_id: uuid.UUID) -> ProductRequest:
    row = await db.get(ProductRequest, request_id)
    if row is None or row.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return row


@router.post("/product-requests/{request_id}/add", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def add_requested_product(request_id: uuid.UUID, data: ProductRequestAdd, db: DB, tenant: Writer) -> ProductOut:
    """One tap: 'cucumber, ₦12,000 per crate' becomes a catalog product retailers can order."""
    row = await _request(db, tenant, request_id)
    try:
        product = await svc.add_request_as_product(
            db, row, name=data.name, unit=data.unit, price=data.price, sku=data.sku, stock=data.stock
        )
    except svc.CatalogError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return ProductOut.model_validate(product)


@router.post("/product-requests/{request_id}/dismiss", response_model=Message)
async def dismiss_request(request_id: uuid.UUID, db: DB, tenant: Writer) -> Message:
    row = await _request(db, tenant, request_id)
    row.status = ProductRequestStatus.dismissed
    await db.commit()
    return Message(detail="Dismissed")
