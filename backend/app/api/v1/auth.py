from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response, status

from app.core.config import settings
from app.core.deps import DB, CurrentTenant
from app.core.security import create_access_token
from app.schemas.auth import (
    BusinessSummary,
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.schemas.common import Message
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "leda_refresh"


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        httponly=True,
        samesite="lax",
        secure=not settings.is_dev,
        max_age=settings.refresh_token_days * 86400,
        path="/api/v1/auth",
    )


def _token_response(user, business_id) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, business_id), expires_in=settings.access_token_minutes * 60
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: DB, response: Response) -> TokenResponse:
    try:
        user, business = await auth_service.register_owner(db, data)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    _set_refresh_cookie(response, await auth_service.issue_refresh_token(db, user))
    return _token_response(user, business.id)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: DB, response: Response) -> TokenResponse:
    try:
        user = await auth_service.authenticate(db, data.email, data.password)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    membership = await auth_service.primary_membership(db, user)
    _set_refresh_cookie(response, await auth_service.issue_refresh_token(db, user))
    return _token_response(user, membership.business_id if membership else None)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(db: DB, response: Response, leda_refresh: Annotated[str | None, Cookie()] = None) -> TokenResponse:
    if not leda_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    try:
        user, new_raw = await auth_service.rotate_refresh_token(db, leda_refresh)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    membership = await auth_service.primary_membership(db, user)
    _set_refresh_cookie(response, new_raw)
    return _token_response(user, membership.business_id if membership else None)


@router.post("/logout", response_model=Message)
async def logout(db: DB, response: Response, leda_refresh: Annotated[str | None, Cookie()] = None) -> Message:
    await auth_service.revoke_refresh_token(db, leda_refresh)
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return Message(detail="Signed out")


@router.get("/me", response_model=MeResponse)
async def me(tenant: CurrentTenant) -> MeResponse:
    return MeResponse(
        user=UserOut.model_validate(tenant.user),
        business=BusinessSummary.model_validate(tenant.business),
        role=tenant.role,
    )
