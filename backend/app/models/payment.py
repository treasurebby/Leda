import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, TZDateTime, money, utcnow, uuid_pk
from app.models.common import JSONType


class PaymentStatus(enum.StrEnum):
    matched = "matched"
    review = "review"  # amount or reference ambiguous; a human matches it
    pending = "pending"  # expected but not received (created at confirmation)


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("provider", "provider_reference"),)

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    retailer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("retailers.id", ondelete="SET NULL"), index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    provider: Mapped[str] = mapped_column(String(32))  # paystack | manual
    provider_reference: Mapped[str] = mapped_column(String(128))
    amount: Mapped[money]
    received_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, name="payment_status"))
    detail: Mapped[str | None] = mapped_column(String(255))
    raw_event: Mapped[dict] = mapped_column(JSONType, default=dict)


class LedgerKind(enum.StrEnum):
    invoice = "invoice"  # debit: retailer owes
    payment = "payment"  # credit: retailer paid
    proforma = "proforma"
    adjustment = "adjustment"


class LedgerEntry(Base):
    """Append-only journal. Balances are computed as SUM(debit - credit); rows are never updated."""

    __tablename__ = "ledger_entries"

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    retailer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("retailers.id", ondelete="SET NULL"), index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"))
    kind: Mapped[LedgerKind] = mapped_column(Enum(LedgerKind, name="ledger_kind"))
    debit: Mapped[money]
    credit: Mapped[money]
    memo: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, index=True)
