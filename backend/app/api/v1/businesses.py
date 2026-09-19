from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import DB, CurrentTenant, Tenant, require
from app.schemas.auth import BusinessSummary
from app.schemas.business import BridgeUpdate, BusinessUpdate

router = APIRouter(prefix="/business", tags=["business"])


@router.get("", response_model=BusinessSummary)
async def get_business(tenant: CurrentTenant) -> BusinessSummary:
    return BusinessSummary.model_validate(tenant.business)


@router.patch("", response_model=BusinessSummary)
async def update_business(
    data: BusinessUpdate, db: DB, tenant: Annotated[Tenant, Depends(require("business:write"))]
) -> BusinessSummary:
    for field, value in data.model_dump(exclude_unset=True).items():
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
