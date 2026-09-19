from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select

from app.core.deps import DB, CurrentTenant
from app.integrations.storage import get_storage
from app.models import Evidence, Order

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/{key:path}")
async def get_media(key: str, db: DB, tenant: CurrentTenant) -> Response:
    """Serve evidence (voice notes, photos) only to members of the business that owns the order."""
    owned = await db.scalar(
        select(Evidence.id)
        .join(Order, Order.id == Evidence.order_id)
        .where(Evidence.storage_key == key, Order.business_id == tenant.business_id)
    )
    if owned is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    found = await get_storage().get(key)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    content, mime = found
    return Response(content=content, media_type=mime, headers={"Cache-Control": "private, max-age=3600"})
