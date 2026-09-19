from fastapi import APIRouter

from app.api.v1 import (
    auth,
    businesses,
    dashboard,
    flags,
    ledger,
    media,
    orders,
    payments,
    products,
    retailers,
    team,
    webhooks,
)
from app.core.config import settings

router = APIRouter()
router.include_router(auth.router)
router.include_router(businesses.router)
router.include_router(team.router)
router.include_router(products.router)
router.include_router(retailers.router)
router.include_router(orders.router)
router.include_router(flags.router)
router.include_router(dashboard.router)
router.include_router(payments.router)
router.include_router(ledger.router)
router.include_router(webhooks.router)
router.include_router(media.router)

if settings.is_dev:
    from app.api.v1 import dev

    router.include_router(dev.router)
