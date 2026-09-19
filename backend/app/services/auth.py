import logging
import uuid
from datetime import timedelta
from html import escape

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import utcnow
from app.core.security import hash_password, hash_token, new_opaque_token, verify_password
from app.integrations.email import EmailSender, OutboundEmail
from app.models import Business, Membership, PasswordResetToken, RefreshToken, Role, User
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


async def issue_refresh_token(
    db: AsyncSession, user: User, remember: bool = True, business_id: uuid.UUID | None = None
) -> str:
    raw = new_opaque_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
            remember=remember,
            business_id=business_id,
        )
    )
    await db.commit()
    return raw


async def rotate_refresh_token(db: AsyncSession, raw: str) -> tuple[User, str, bool, uuid.UUID | None]:
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if row is None or row.revoked_at is not None or row.expires_at < utcnow():
        raise AuthError("Refresh token is invalid or expired")
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("User not found")
    claimed = await db.execute(
        update(RefreshToken).where(RefreshToken.id == row.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    if claimed.rowcount != 1:
        raise AuthError("Refresh token is invalid or expired")
    new_raw = await issue_refresh_token(db, user, row.remember, row.business_id)
    return user, new_raw, row.remember, row.business_id


async def revoke_refresh_token(db: AsyncSession, raw: str | None) -> None:
    if not raw:
        return
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if row and row.revoked_at is None:
        row.revoked_at = utcnow()
        await db.commit()


async def request_password_reset(db: AsyncSession, email: str, mailer: EmailSender) -> None:
    user = await db.scalar(select(User).where(User.email == email.lower(), User.is_active.is_(True)))
    if user is None:
        return
    now = utcnow()
    recent = await db.scalar(
        select(PasswordResetToken.id).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.created_at > now - timedelta(minutes=1),
        )
    )
    if recent:
        return
    await db.execute(
        update(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    raw = new_opaque_token()
    row = PasswordResetToken(user_id=user.id, token_hash=hash_token(raw), expires_at=now + timedelta(minutes=30))
    db.add(row)
    link = f"{settings.public_app_url.rstrip('/')}/#/reset-password/{raw}"
    try:
        await mailer.send(OutboundEmail(
            to=user.email, subject="Reset your Leda password",
            html=f'<p>Reset your Leda password using <a href="{escape(link, quote=True)}">this link</a>.</p>'
                 "<p>It expires in 30 minutes and can be used once. "
                 "If you did not request this, ignore this email.</p>",
            text=f"Reset your Leda password: {link}\nThis link expires in 30 minutes and can be used once.",
        ))
    except Exception:
        # Keep the public response identical for known and unknown accounts. Never log the token.
        await db.rollback()
        logging.getLogger(__name__).error("Password reset email delivery failed")
        return
    await db.commit()


async def reset_password(db: AsyncSession, raw: str, password: str) -> None:
    now = utcnow()
    row = await db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw)))
    if row is None or row.used_at is not None or row.expires_at <= now:
        raise AuthError("This reset link is invalid or expired. Request a new one.")
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("This reset link is invalid or expired. Request a new one.")
    claimed = await db.execute(
        update(PasswordResetToken).where(PasswordResetToken.id == row.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    if claimed.rowcount != 1:
        raise AuthError("This reset link is invalid or expired. Request a new one.")
    user.password_hash = hash_password(password)
    user.auth_version += 1
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked_at=now))
    await db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user.id).values(used_at=now))
    await db.commit()
