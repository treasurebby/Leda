import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import Business, Membership, Role, User

bearer = HTTPBearer(auto_error=False)

DB = Annotated[AsyncSession, Depends(get_db)]


async def current_user(db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access_token(creds.credentials)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


class Tenant:
    """The authenticated user's membership in the business the token was issued for."""

    def __init__(self, user: User, business: Business, membership: Membership):
        self.user = user
        self.business = business
        self.membership = membership
        self.role = membership.role

    @property
    def business_id(self) -> uuid.UUID:
        return self.business.id


async def current_tenant(
    db: DB, user: CurrentUser, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> Tenant:
    payload = decode_access_token(creds.credentials) if creds else None
    biz = payload.get("biz") if payload else None
    stmt = select(Membership).where(Membership.user_id == user.id)
    if biz:
        stmt = stmt.where(Membership.business_id == uuid.UUID(biz))
    membership = (await db.execute(stmt.order_by(Membership.created_at))).scalars().first()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No business on this account")
    business = await db.get(Business, membership.business_id)
    assert business is not None
    return Tenant(user, business, membership)


CurrentTenant = Annotated[Tenant, Depends(current_tenant)]

# What each role may do. Owner and admin get everything.
PERMISSIONS: dict[str, set[Role]] = {
    "business:write": {Role.owner, Role.admin},
    "team:write": {Role.owner, Role.admin},
    "products:write": {Role.owner, Role.admin, Role.ops, Role.warehouse},
    "retailers:write": {Role.owner, Role.admin, Role.ops, Role.sales},
    "orders:write": {Role.owner, Role.admin, Role.ops, Role.sales},
    "payments:write": {Role.owner, Role.admin, Role.accountant},
    "ledger:read": {Role.owner, Role.admin, Role.accountant, Role.viewer},
}


def require(permission: str) -> Callable[..., Tenant]:
    allowed = PERMISSIONS[permission]

    async def _gate(tenant: CurrentTenant) -> Tenant:
        if tenant.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Role '{tenant.role.value}' cannot {permission}")
        return tenant

    return _gate
