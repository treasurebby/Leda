from fastapi import APIRouter

from app.api.v1 import auth, businesses, products, retailers, team

router = APIRouter()
router.include_router(auth.router)
router.include_router(businesses.router)
router.include_router(team.router)
router.include_router(products.router)
router.include_router(retailers.router)
