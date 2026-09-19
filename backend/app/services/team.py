from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import utcnow
from app.core.security import hash_password, hash_token, new_opaque_token
from app.integrations.email import EmailSender, OutboundEmail
from app.models import Business, Invite, Membership, Role, User
from app.schemas.team import InviteAccept, InviteCreate, MemberOut


class TeamError(Exception):
    pass


async def list_members(db: AsyncSession, business_id) -> list[MemberOut]:
    rows = await db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.business_id == business_id)
        .order_by(Membership.created_at)
    )
    return [
        MemberOut(
            membership_id=m.id,
            user_id=u.id,
            email=u.email,
            phone=u.phone,
            full_name=u.full_name,
            role=m.role,
            joined_at=m.created_at,
        )
        for m, u in rows.all()
    ]


async def create_invite(
    db: AsyncSession, business: Business, inviter: User, data: InviteCreate, mailer: EmailSender
) -> Invite:
    email = data.email.lower()
    already_member = await db.scalar(
        select(Membership).join(User).where(Membership.business_id == business.id, User.email == email)
    )
    if already_member:
        raise TeamError("This person is already on the team")
    pending = await db.scalar(
        select(Invite).where(Invite.business_id == business.id, Invite.email == email, Invite.accepted_at.is_(None))
    )
    if pending:
        await db.delete(pending)  # re-inviting replaces the old link

    raw = new_opaque_token()
    invite = Invite(
        business_id=business.id,
        email=email,
        phone=data.phone,
        role=data.role,
        token_hash=hash_token(raw),
        expires_at=utcnow() + timedelta(days=settings.invite_token_days),
        invited_by=inviter.id,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    link = f"{settings.public_app_url}/#/join/{raw}"
    await mailer.send(
        OutboundEmail(
            to=email,
            subject=f"{inviter.full_name} invited you to {business.name} on Leda",
            html=(
                f"<p>{inviter.full_name} has invited you to join <strong>{business.name}</strong> on Leda "
                f"as <strong>{data.role.value}</strong>.</p>"
                f'<p><a href="{link}">Accept the invitation</a> '
                f"(link expires in {settings.invite_token_days} days).</p>"
            ),
            text=f"{inviter.full_name} invited you to {business.name} on Leda. Accept: {link}",
        )
    )
    return invite


async def accept_invite(db: AsyncSession, raw_token: str, data: InviteAccept) -> tuple[User, Business]:
    invite = await db.scalar(select(Invite).where(Invite.token_hash == hash_token(raw_token)))
    if invite is None or invite.accepted_at is not None or invite.expires_at < utcnow():
        raise TeamError("This invitation is invalid or has expired")

    user = await db.scalar(select(User).where(User.email == invite.email))
    if user is None:
        user = User(
            email=invite.email,
            phone=invite.phone,
            full_name=data.full_name.strip(),
            password_hash=hash_password(data.password),
        )
        db.add(user)
        await db.flush()
    db.add(Membership(user_id=user.id, business_id=invite.business_id, role=invite.role))
    invite.accepted_at = utcnow()
    await db.commit()
    business = await db.get(Business, invite.business_id)
    assert business is not None
    return user, business


async def change_role(db: AsyncSession, business_id, membership_id, role: Role) -> Membership:
    membership = await db.get(Membership, membership_id)
    if membership is None or membership.business_id != business_id:
        raise TeamError("Member not found")
    if membership.role == Role.owner:
        raise TeamError("The owner's role cannot be changed here")
    membership.role = role
    await db.commit()
    return membership


async def remove_member(db: AsyncSession, business_id, membership_id) -> None:
    membership = await db.get(Membership, membership_id)
    if membership is None or membership.business_id != business_id:
        raise TeamError("Member not found")
    if membership.role == Role.owner:
        raise TeamError("The owner cannot be removed")
    await db.delete(membership)
    await db.commit()
