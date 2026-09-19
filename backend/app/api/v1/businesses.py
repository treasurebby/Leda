from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import DB, CurrentTenant, Tenant, require
from app.schemas.auth import BusinessSummary
from app.schemas.business import BridgeUpdate, BusinessUpdate

router = APIRouter(prefix="/business", tags=["business"])


@router.get("", response_model=BusinessSummary)
async def get_business(tenant: CurrentTenant) -> BusinessSummary:
    return BusinessSummary.model_validate(tenant.business)


@router.post("/complete-setup", response_model=BusinessSummary)
async def complete_setup(db: DB, tenant: Annotated[Tenant, Depends(require("business:write"))]) -> BusinessSummary:
    if tenant.business.bridge_method is None:
        raise HTTPException(400, "Choose your WhatsApp connection before completing setup")
    tenant.business.onboarding_completed = True
    await db.commit()
    return BusinessSummary.model_validate(tenant.business)


@router.patch("", response_model=BusinessSummary)
async def update_business(
    data: BusinessUpdate, db: DB, tenant: Annotated[Tenant, Depends(require("business:write"))]
) -> BusinessSummary:
    changes = data.model_dump(exclude_unset=True)
    if changes.get("whatsapp_number"):
        # A WhatsApp number can route to one workspace only: connecting it here disconnects it elsewhere.
        from sqlalchemy import select

        from app.models import Business

        others = (
            await db.execute(
                select(Business).where(
                    Business.whatsapp_number == changes["whatsapp_number"], Business.id != tenant.business_id
                )
            )
        ).scalars()
        for other in others:
            other.whatsapp_number = None
    for field, value in changes.items():
        setattr(tenant.business, field, value.strip() if isinstance(value, str) else value)
    await db.commit()
    return BusinessSummary.model_validate(tenant.business)


@router.patch("/bridge", response_model=BusinessSummary)
async def update_bridge(
    data: BridgeUpdate, db: DB, tenant: Annotated[Tenant, Depends(require("business:write"))]
) -> BusinessSummary:
    """Onboarding step 2. A virtual number is provisioned later by the WhatsApp integration."""
    tenant.business.bridge_method = data.method
    tenant.business.whatsapp_number = data.phone if data.method.value == "current" else None
    await db.commit()
    return BusinessSummary.model_validate(tenant.business)
