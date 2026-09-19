import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, str_120, uuid_pk


class BridgeMethod(enum.StrEnum):
    current = "current"  # distributor keeps their existing WhatsApp number
    virtual = "virtual"  # Leda provisions a virtual number


class Business(TimestampMixin, Base):
    __tablename__ = "businesses"

    id: Mapped[uuid_pk]
    name: Mapped[str_120]
    industry: Mapped[str_120]
    custom_industry: Mapped[str | None] = mapped_column(String(120))
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    bridge_method: Mapped[BridgeMethod | None] = mapped_column(Enum(BridgeMethod, name="bridge_method"))
    whatsapp_number: Mapped[str | None] = mapped_column(String(32), index=True)
    # Per-business counter for human-readable order numbers (LE-1041). Bumped inside a row lock.
    next_order_number: Mapped[int] = mapped_column(Integer, default=1001)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)

    memberships: Mapped[list["Membership"]] = relationship(back_populates="business")  # noqa: F821
