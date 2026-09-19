from fastapi import APIRouter

from app.api.v1 import auth, businesses, team

router = APIRouter()
router.include_router(auth.router)
router.include_router(businesses.router)
router.include_router(team.router)
