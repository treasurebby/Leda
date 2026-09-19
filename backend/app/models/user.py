import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, str_120, str_255, utcnow, uuid_pk


class Role(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    ops = "ops"
    sales = "sales"
    accountant = "accountant"
    warehouse = "warehouse"
    viewer = "viewer"


# Labels the onboarding UI uses (frontend/src/onboarding/model.ts ROLES) -> internal role.
ROLE_LABELS: dict[str, Role] = {
    "Sales representative": Role.sales,
    "Administrator": Role.admin,
    "Operations manager": Role.ops,
    "Accountant": Role.accountant,
    "Warehouse staff": Role.warehouse,
    "Viewer": Role.viewer,
}


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid_pk]
    email: Mapped[str_255] = mapped_column(unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    full_name: Mapped[str_120]
    password_hash: Mapped[str_255]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "business_id"),)

    id: Mapped[uuid_pk]
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    role: Mapped[Role] = mapped_column(Enum(Role, name="role"), default=Role.viewer)

    user: Mapped[User] = relationship(back_populates="memberships")
    business: Mapped["Business"] = relationship(back_populates="memberships")  # noqa: F821


class Invite(TimestampMixin, Base):
    __tablename__ = "invites"

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    email: Mapped[str_255]
    phone: Mapped[str | None] = mapped_column(String(32))
    role: Mapped[Role] = mapped_column(Enum(Role, name="role"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid_pk]
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
