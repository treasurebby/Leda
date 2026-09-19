import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import normalise_phone
from app.models import ImportKind, ImportStatus, RetailerTier
from app.schemas.common import Money, ORMModel


class ProductIn(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    unit: str | None = Field(default=None, max_length=64)
    price: Decimal = Field(ge=0, decimal_places=2)
    stock: int = Field(default=0, ge=0)
    reserved: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=0, ge=0)
    aliases: list[str] = Field(default_factory=list)

    @field_validator("sku")
    @classmethod
    def _sku(cls, v: str) -> str:
        return v.strip().upper()


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    unit: str | None = Field(default=None, max_length=64)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    stock: int | None = Field(default=None, ge=0)
    reserved: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)
    aliases: list[str] | None = None


class ProductOut(ORMModel):
    id: uuid.UUID
    sku: str
    name: str
    unit: str | None
    price: Money
    stock: int
    reserved: int
    reorder_level: int
    available: int
    low_stock: bool
    aliases: list[str]
    updated_at: datetime


class RestockRequest(BaseModel):
    quantity: int = Field(gt=0)


class RetailerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = None
    market: str | None = Field(default=None, max_length=120)
    terms: str = Field(default="Cash on delivery", max_length=64)
    tier: RetailerTier = RetailerTier.standard

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if not v:
            return None
        normalised = normalise_phone(v)
        if not normalised:
            raise ValueError("Use a valid Nigerian phone number")
        return normalised


class RetailerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = None
    market: str | None = Field(default=None, max_length=120)
    terms: str | None = Field(default=None, max_length=64)
    tier: RetailerTier | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if not v:
            return None
        normalised = normalise_phone(v)
        if not normalised:
            raise ValueError("Use a valid Nigerian phone number")
        return normalised


class RetailerOut(ORMModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    market: str | None
    terms: str
    tier: RetailerTier
    account_reference: str | None
    dva_account_number: str | None
    dva_bank: str | None
    created_at: datetime


class ImportJobOut(ORMModel):
    id: uuid.UUID
    kind: ImportKind
    status: ImportStatus
    file_name: str
    total: int
    inserted: int
    updated: int
    errors: list[str]
    created_at: datetime
    finished_at: datetime | None


class Page[T](BaseModel):
    items: list[T]
    total: int


class CatalogItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    unit: str | None = Field(default=None, max_length=64)
    price: Decimal | None = Field(default=None, ge=0)
    sku: str | None = Field(default=None, max_length=64)
    stock: int = Field(default=0, ge=0)
    aliases: list[str] = Field(default_factory=list)
    confidence: int = Field(default=100, ge=0, le=100)
    note: str | None = None


class CatalogDraftOut(ORMModel):
    id: uuid.UUID
    source: str
    status: str
    items: list[CatalogItem]
    summary: str | None = None
    inserted: int
    updated: int
    created_at: datetime


class CatalogExtractText(BaseModel):
    """Pasted price list. (Photos and voice notes go through the multipart endpoint.)"""

    text: str = Field(min_length=3, max_length=20000)


class CatalogApply(BaseModel):
    items: list[CatalogItem] | None = None  # edited rows; omit to apply the draft as extracted


class ProductRequestOut(ORMModel):
    id: uuid.UUID
    query: str
    times_asked: int
    status: str
    product_id: uuid.UUID | None
    first_asked_at: datetime
    last_asked_at: datetime


class ProductRequestAdd(BaseModel):
    price: Decimal = Field(ge=0)
    name: str | None = Field(default=None, max_length=120)
    unit: str | None = Field(default=None, max_length=64)
    sku: str | None = Field(default=None, max_length=64)
    stock: int = Field(default=0, ge=0)
