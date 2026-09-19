import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, TZDateTime, money, utcnow, uuid_pk
from app.models.common import JSONType


class Channel(enum.StrEnum):
    voice = "voice"
    text = "text"
    photo = "photo"
    manual = "manual"


class OrderStatus(enum.StrEnum):
    processing = "processing"  # decoded cleanly, awaiting confirmation to retailer
    needs_review = "needs_review"  # has open flags or low-confidence lines
    pending = "pending"  # confirmed, invoice raised, awaiting payment
    paid = "paid"
    cancelled = "cancelled"


class ReviewState(enum.StrEnum):
    sure = "sure"  # Sabi matched clearly
    check = "check"  # ambiguous; needs a human
    verified = "verified"  # a human compared it to the evidence


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("business_id", "number"),)

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    number: Mapped[str] = mapped_column(String(16))  # LE-1041
    retailer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("retailers.id", ondelete="SET NULL"), index=True)
    channel: Mapped[Channel] = mapped_column(Enum(Channel, name="channel"))
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="order_status"), default=OrderStatus.processing)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    subtotal: Mapped[money]
    # Free-text retailer name when the sender could not be matched to a retailer row.
    retailer_name_guess: Mapped[str | None] = mapped_column(String(120))
    confirmed_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    paid_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    # The automatic WhatsApp reply Leda sent for this message, kept for the audit trail.
    reply_text: Mapped[str | None] = mapped_column(Text)

    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderLine.position"
    )
    evidence: Mapped[list["Evidence"]] = relationship(cascade="all, delete-orphan", order_by="Evidence.created_at")
    flags: Mapped[list["Flag"]] = relationship(cascade="all, delete-orphan", order_by="Flag.created_at")
    retailer: Mapped["Retailer"] = relationship()  # noqa: F821


class OrderLine(TimestampMixin, Base):
    __tablename__ = "order_lines"

    id: Mapped[uuid_pk]
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    product_name: Mapped[str] = mapped_column(String(120))  # snapshot; survives catalog edits
    sku: Mapped[str | None] = mapped_column(String(64))
    unit: Mapped[str | None] = mapped_column(String(64))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[money]
    confidence_score: Mapped[int] = mapped_column(Integer, default=100)  # 0-100
    review_state: Mapped[ReviewState] = mapped_column(Enum(ReviewState, name="review_state"), default=ReviewState.sure)
    reasoning: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="lines")

    @property
    def total(self):
        return self.unit_price * self.quantity


class EvidenceKind(enum.StrEnum):
    voice = "voice"
    photo = "photo"
    text = "text"
    transcript = "transcript"


class Evidence(Base):
    """An original signal from the retailer. Never rewritten once created."""

    __tablename__ = "evidence"

    id: Mapped[uuid_pk]
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    kind: Mapped[EvidenceKind] = mapped_column(Enum(EvidenceKind, name="evidence_kind"))
    storage_key: Mapped[str | None] = mapped_column(String(255))
    mime: Mapped[str | None] = mapped_column(String(64))
    duration_s: Mapped[int | None] = mapped_column(Integer)
    text: Mapped[str | None] = mapped_column(Text)  # message body, or the transcript
    raw_payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class FlagKind(enum.StrEnum):
    voice = "voice"
    photo = "photo"
    slang = "slang"


class FlagStatus(enum.StrEnum):
    open = "open"
    resolved = "resolved"
    asked_retailer = "asked_retailer"


class Flag(Base):
    __tablename__ = "flags"

    id: Mapped[uuid_pk]
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    line_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("order_lines.id", ondelete="SET NULL"))
    kind: Mapped[FlagKind] = mapped_column(Enum(FlagKind, name="flag_kind"))
    issue: Mapped[str] = mapped_column(String(160))  # "Quantity unclear (54% confidence)"
    quote: Mapped[str] = mapped_column(Text)  # what the retailer actually said / sent
    why: Mapped[str] = mapped_column(Text)  # Sabi's reasoning
    options: Mapped[list[dict]] = mapped_column(JSONType, default=list)  # [{label, sku, quantity}]
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[FlagStatus] = mapped_column(Enum(FlagStatus, name="flag_status"), default=FlagStatus.open)
    resolved_option: Mapped[dict | None] = mapped_column(JSONType)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # payment | flag | order
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str] = mapped_column(String(255))
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    read_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
