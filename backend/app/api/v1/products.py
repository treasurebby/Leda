import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.db import get_session_factory
from app.core.deps import DB, CurrentTenant, Tenant, require
from app.jobs.import_job import run_import
from app.models import ImportJob, ImportKind, Product
from app.schemas.catalog import ImportJobOut, Page, ProductIn, ProductOut, ProductUpdate, RestockRequest
from app.schemas.common import Message

router = APIRouter(tags=["products"])
Writer = Annotated[Tenant, Depends(require("products:write"))]


async def _get(db, tenant: Tenant, product_id: uuid.UUID) -> Product:
    product = await db.get(Product, product_id)
    if product is None or product.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product


@router.get("/products", response_model=Page[ProductOut])
async def list_products(
    db: DB,
    tenant: CurrentTenant,
    q: str | None = None,
    low_stock: bool = False,
    limit: Annotated[int, Query(le=500)] = 100,
    offset: int = 0,
) -> Page[ProductOut]:
    stmt = select(Product).where(Product.business_id == tenant.business_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Product.name).like(like), func.lower(Product.sku).like(like)))
    if low_stock:
        stmt = stmt.where(Product.reorder_level > 0, (Product.stock - Product.reserved) <= Product.reorder_level)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(Product.name).limit(limit).offset(offset))).scalars().all()
    return Page(items=[ProductOut.model_validate(p) for p in rows], total=total or 0)


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(data: ProductIn, db: DB, tenant: Writer) -> ProductOut:
    product = Product(business_id=tenant.business_id, **data.model_dump())
    db.add(product)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"SKU {data.sku} already exists") from exc
    return ProductOut.model_validate(product)


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(product_id: uuid.UUID, db: DB, tenant: CurrentTenant) -> ProductOut:
    return ProductOut.model_validate(await _get(db, tenant, product_id))


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: uuid.UUID, data: ProductUpdate, db: DB, tenant: Writer) -> ProductOut:
    product = await _get(db, tenant, product_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    await db.commit()
    return ProductOut.model_validate(product)


@router.post("/products/{product_id}/restock", response_model=ProductOut)
async def restock(product_id: uuid.UUID, data: RestockRequest, db: DB, tenant: Writer) -> ProductOut:
    product = await _get(db, tenant, product_id)
    product.stock += data.quantity
    await db.commit()
    return ProductOut.model_validate(product)


@router.delete("/products/{product_id}", response_model=Message)
async def delete_product(product_id: uuid.UUID, db: DB, tenant: Writer) -> Message:
    await db.delete(await _get(db, tenant, product_id))
    await db.commit()
    return Message(detail="Product deleted")


# ------------------------------------------------------------------ imports
async def start_import(
    kind: ImportKind, file: UploadFile, db, tenant: Tenant, tasks: BackgroundTasks, session_factory
) -> ImportJob:
    content = await file.read()
    job = ImportJob(business_id=tenant.business_id, kind=kind, file_name=file.filename or "upload")
    db.add(job)
    await db.commit()
    tasks.add_task(run_import, job.id, job.file_name, content, session_factory)
    return job


@router.post("/products/import", response_model=ImportJobOut, status_code=status.HTTP_202_ACCEPTED)
async def import_products(
    file: UploadFile,
    db: DB,
    tenant: Writer,
    tasks: BackgroundTasks,
    session_factory: Annotated[object, Depends(get_session_factory)],
) -> ImportJobOut:
    job = await start_import(ImportKind.products, file, db, tenant, tasks, session_factory)
    return ImportJobOut.model_validate(job)


@router.get("/import-jobs/{job_id}", response_model=ImportJobOut)
async def get_import_job(job_id: uuid.UUID, db: DB, tenant: CurrentTenant) -> ImportJobOut:
    job = await db.get(ImportJob, job_id)
    if job is None or job.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found")
    return ImportJobOut.model_validate(job)
