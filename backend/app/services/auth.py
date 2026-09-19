from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import utcnow
from app.core.security import hash_password, hash_token, new_opaque_token, verify_password
from app.models import Business, Membership, RefreshToken, Role, User
from app.schemas.auth import RegisterRequest


class AuthError(Exception):
    pass


async def register_owner(db: AsyncSession, data: RegisterRequest) -> tuple[User, Business]:
    email = data.email.lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise AuthError("An account with this email already exists")

    user = User(
        email=email, phone=data.phone, full_name=data.full_name.strip(), password_hash=hash_password(data.password)
    )
    db.add(user)
    await db.flush()
    business = Business(
        name=data.business_name.strip(),
        industry=data.industry,
        custom_industry=(data.custom_industry or "").strip() or None,
        owner_id=user.id,
    )
    db.add(business)
    await db.flush()
    db.add(Membership(user_id=user.id, business_id=business.id, role=Role.owner))
    await db.commit()
    return user, business


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email.lower()))
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise AuthError("Incorrect email or password")
    return user


async def primary_membership(db: AsyncSession, user: User) -> Membership | None:
    return await db.scalar(select(Membership).where(Membership.user_id == user.id).order_by(Membership.created_at))


async def issue_refresh_token(db: AsyncSession, user: User) -> str:
    raw = new_opaque_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
        )
    )
    await db.commit()
    return raw


async def rotate_refresh_token(db: AsyncSession, raw: str) -> tuple[User, str]:
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if row is None or row.revoked_at is not None or row.expires_at < utcnow():
        raise AuthError("Refresh token is invalid or expired")
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("User not found")
    row.revoked_at = utcnow()
    new_raw = await issue_refresh_token(db, user)
    return user, new_raw


async def revoke_refresh_token(db: AsyncSession, raw: str | None) -> None:
    if not raw:
        return
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if row and row.revoked_at is None:
        row.revoked_at = utcnow()
        await db.commit()
