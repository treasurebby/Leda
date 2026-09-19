import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, TZDateTime, money, str_120, utcnow, uuid_pk
from app.models.common import JSONType


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("business_id", "sku"),)

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(64))
    name: Mapped[str_120]
    unit: Mapped[str | None] = mapped_column(String(64))  # "Bag 50kg", "Keg 25L"
    price: Mapped[money]
    stock: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, default=0)
    # Slang / nicknames retailers use ("the yellow one"); fed to the decoder.
    aliases: Mapped[list[str]] = mapped_column(JSONType, default=list)

    @property
    def available(self) -> int:
        return max(self.stock - self.reserved, 0)

    @property
    def low_stock(self) -> bool:
        return self.reorder_level > 0 and self.available <= self.reorder_level


class RetailerTier(enum.StrEnum):
    standard = "Standard"
    silver = "Silver"
    gold = "Gold"


class Retailer(TimestampMixin, Base):
    __tablename__ = "retailers"

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str_120]
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32), index=True)  # E.164; matched against WhatsApp sender
    market: Mapped[str | None] = mapped_column(String(120))
    terms: Mapped[str] = mapped_column(String(64), default="Cash on delivery")
    tier: Mapped[RetailerTier] = mapped_column(Enum(RetailerTier, name="retailer_tier"), default=RetailerTier.standard)
    # Payment provider linkage. account_reference is what the retailer types into their bank transfer.
    account_reference: Mapped[str | None] = mapped_column(String(64), index=True)
    paystack_customer_code: Mapped[str | None] = mapped_column(String(64))
    dva_account_number: Mapped[str | None] = mapped_column(String(32))
    dva_bank: Mapped[str | None] = mapped_column(String(64))


class ImportKind(enum.StrEnum):
    products = "products"
    retailers = "retailers"


class ImportStatus(enum.StrEnum):
    queued = "queued"
    processing = "processing"
    done = "done"
    failed = "failed"


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    kind: Mapped[ImportKind] = mapped_column(Enum(ImportKind, name="import_kind"))
    status: Mapped[ImportStatus] = mapped_column(Enum(ImportStatus, name="import_status"), default=ImportStatus.queued)
    file_name: Mapped[str] = mapped_column(String(255))
    total: Mapped[int] = mapped_column(Integer, default=0)
    inserted: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list[str]] = mapped_column(JSONType, default=list)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(TZDateTime)
