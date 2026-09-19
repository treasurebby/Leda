"""Runs a product or retailer import to completion and records the outcome on the ImportJob row.

Executed via FastAPI BackgroundTasks in its own DB session, so the HTTP response returns immediately
and the client polls GET /import-jobs/{id}.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal, utcnow
from app.models import ImportJob, ImportKind, ImportStatus, Product, Retailer
from app.services import imports

log = logging.getLogger(__name__)


async def run_import(job_id: uuid.UUID, file_name: str, content: bytes, session_factory=SessionLocal) -> None:
    async with session_factory() as db:
        job = await db.get(ImportJob, job_id)
        if job is None:
            return
        job.status = ImportStatus.processing
        await db.commit()
        try:
            rows = imports.read_spreadsheet(file_name, content)
            if job.kind == ImportKind.products:
                inserted, updated = await _upsert_products(db, job.business_id, imports.parse_products(rows))
            else:
                inserted, updated = await _upsert_retailers(db, job.business_id, imports.parse_retailers(rows))
            job.total = len(rows) - 1
            job.inserted, job.updated = inserted, updated
            job.status = ImportStatus.done
        except imports.ImportError_ as exc:
            job.status = ImportStatus.failed
            job.errors = [str(exc)]
        except Exception:
            log.exception("import job %s crashed", job_id)
            job.status = ImportStatus.failed
            job.errors = ["Something went wrong while importing. Please try again."]
        job.finished_at = utcnow()
        await db.commit()


async def _upsert_products(db: AsyncSession, business_id: uuid.UUID, rows: list[imports.ProductRow]) -> tuple[int, int]:
    existing = {
        p.sku: p for p in (await db.execute(select(Product).where(Product.business_id == business_id))).scalars()
    }
    inserted = updated = 0
    for row in rows:
        if row.sku in existing:
            p = existing[row.sku]
            p.name, p.price, p.stock = row.name, row.price, row.stock
            if row.unit:
                p.unit = row.unit
            updated += 1
        else:
            db.add(
                Product(
                    business_id=business_id, sku=row.sku, name=row.name, unit=row.unit, price=row.price, stock=row.stock
                )
            )
            inserted += 1
    await db.flush()
    return inserted, updated


async def _upsert_retailers(
    db: AsyncSession, business_id: uuid.UUID, rows: list[imports.RetailerRow]
) -> tuple[int, int]:
    existing = (await db.execute(select(Retailer).where(Retailer.business_id == business_id))).scalars().all()
    by_email = {r.email: r for r in existing if r.email}
    by_phone = {r.phone: r for r in existing if r.phone}
    inserted = updated = 0
    for row in rows:
        match = (row.email and by_email.get(row.email)) or (row.phone and by_phone.get(row.phone))
        if match:
            match.name = row.name
            match.email = row.email or match.email
            match.phone = row.phone or match.phone
            match.market = row.market or match.market
            updated += 1
        else:
            r = Retailer(business_id=business_id, name=row.name, email=row.email, phone=row.phone, market=row.market)
            db.add(r)
            if r.email:
                by_email[r.email] = r
            if r.phone:
                by_phone[r.phone] = r
            inserted += 1
    await db.flush()
    return inserted, updated
