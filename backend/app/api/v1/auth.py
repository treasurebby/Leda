from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from app.core.config import settings
from app.core.deps import DB, CurrentTenant
from app.core.security import create_access_token
from app.integrations.email import EmailSender, FakeEmailSender, get_email_sender
from app.schemas.auth import (
    BusinessSummary,
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)
from app.schemas.common import Message
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "leda_refresh"


def _set_refresh_cookie(response: Response, raw: str, remember: bool = True) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        httponly=True,
        samesite="lax",
        secure=not settings.is_dev,
        max_age=settings.refresh_token_days * 86400 if remember else None,
        path="/api/v1/auth",
    )


def _token_response(user, business_id) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, business_id, user.auth_version),
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: DB, response: Response) -> TokenResponse:
    try:
        user, business = await auth_service.register_owner(db, data)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    _set_refresh_cookie(response, await auth_service.issue_refresh_token(db, user, business_id=business.id))
    return _token_response(user, business.id)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: DB, response: Response) -> TokenResponse:
    try:
        user = await auth_service.authenticate(db, data.email, data.password)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    membership = await auth_service.primary_membership(db, user)
    _set_refresh_cookie(
        response, await auth_service.issue_refresh_token(
            db, user, data.remember, membership.business_id if membership else None
        ), data.remember,
    )
    return _token_response(user, membership.business_id if membership else None)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(db: DB, response: Response, leda_refresh: Annotated[str | None, Cookie()] = None) -> TokenResponse:
    if not leda_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    try:
        user, new_raw, remember, business_id = await auth_service.rotate_refresh_token(db, leda_refresh)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    membership = await auth_service.primary_membership(db, user)
    _set_refresh_cookie(response, new_raw, remember)
    return _token_response(user, business_id or (membership.business_id if membership else None))


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


@router.post("/forgot-password", response_model=Message)
async def forgot_password(
    data: ForgotPasswordRequest, db: DB, mailer: Annotated[EmailSender, Depends(get_email_sender)]
) -> Message:
    if settings.app_env == "prod" and isinstance(mailer, FakeEmailSender):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Password recovery is temporarily unavailable")
    await auth_service.request_password_reset(db, str(data.email), mailer)
    return Message(detail="If an account exists for this email, a password reset link will arrive shortly.")


@router.post("/reset-password", response_model=Message)
async def reset_password(data: ResetPasswordRequest, db: DB, response: Response) -> Message:
    try:
        await auth_service.reset_password(db, data.token, data.password)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return Message(detail="Password updated. Sign in with your new password.")
