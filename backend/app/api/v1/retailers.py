import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select

from app.api.v1.products import start_import
from app.core.db import get_session_factory
from app.core.deps import DB, CurrentTenant, Tenant, require
from app.models import ImportKind, Retailer
from app.schemas.catalog import ImportJobOut, Page, RetailerIn, RetailerOut, RetailerUpdate
from app.schemas.common import Message

router = APIRouter(prefix="/retailers", tags=["retailers"])
Writer = Annotated[Tenant, Depends(require("retailers:write"))]


async def _get(db, tenant: Tenant, retailer_id: uuid.UUID) -> Retailer:
    retailer = await db.get(Retailer, retailer_id)
    if retailer is None or retailer.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Retailer not found")
    return retailer


@router.get("", response_model=Page[RetailerOut])
async def list_retailers(
    db: DB, tenant: CurrentTenant, q: str | None = None, limit: Annotated[int, Query(le=500)] = 100, offset: int = 0
) -> Page[RetailerOut]:
    stmt = select(Retailer).where(Retailer.business_id == tenant.business_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Retailer.name).like(like), func.lower(Retailer.market).like(like), Retailer.phone.like(like))
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(Retailer.name).limit(limit).offset(offset))).scalars().all()
    return Page(items=[RetailerOut.model_validate(r) for r in rows], total=total or 0)


@router.post("", response_model=RetailerOut, status_code=status.HTTP_201_CREATED)
async def create_retailer(data: RetailerIn, db: DB, tenant: Writer) -> RetailerOut:
    if not data.email and not data.phone:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Add an email or phone number")
    retailer = Retailer(business_id=tenant.business_id, **data.model_dump())
    db.add(retailer)
    await db.commit()
    return RetailerOut.model_validate(retailer)


@router.get("/{retailer_id}", response_model=RetailerOut)
async def get_retailer(retailer_id: uuid.UUID, db: DB, tenant: CurrentTenant) -> RetailerOut:
    return RetailerOut.model_validate(await _get(db, tenant, retailer_id))


@router.patch("/{retailer_id}", response_model=RetailerOut)
async def update_retailer(retailer_id: uuid.UUID, data: RetailerUpdate, db: DB, tenant: Writer) -> RetailerOut:
    retailer = await _get(db, tenant, retailer_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(retailer, k, v)
    await db.commit()
    return RetailerOut.model_validate(retailer)


@router.delete("/{retailer_id}", response_model=Message)
async def delete_retailer(retailer_id: uuid.UUID, db: DB, tenant: Writer) -> Message:
    await db.delete(await _get(db, tenant, retailer_id))
    await db.commit()
    return Message(detail="Retailer deleted")


@router.post("/import", response_model=ImportJobOut, status_code=status.HTTP_202_ACCEPTED)
async def import_retailers(
    file: UploadFile,
    db: DB,
    tenant: Writer,
    tasks: BackgroundTasks,
    session_factory: Annotated[object, Depends(get_session_factory)],
) -> ImportJobOut:
    job = await start_import(ImportKind.retailers, file, db, tenant, tasks, session_factory)
    return ImportJobOut.model_validate(job)
