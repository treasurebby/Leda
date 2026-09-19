import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, computed_field

from app.models import Channel, EvidenceKind, FlagKind, FlagStatus, OrderStatus, ReviewState
from app.schemas.common import Money, ORMModel


class LineIn(BaseModel):
    id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    product_name: str | None = Field(default=None, max_length=120)
    sku: str | None = None
    unit: str | None = None
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(ge=0, decimal_places=2)
    review_state: ReviewState | None = None


class LineOut(ORMModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    product_name: str
    sku: str | None
    unit: str | None
    quantity: int
    unit_price: Money
    confidence_score: int
    review_state: ReviewState
    reasoning: str | None

    @computed_field
    @property
    def total(self) -> Money:
        return self.unit_price * self.quantity


class EvidenceOut(ORMModel):
    id: uuid.UUID
    kind: EvidenceKind
    mime: str | None
    duration_s: int | None
    text: str | None
    url: str | None = None  # signed/served URL for voice and photo evidence
    created_at: datetime


class FlagOut(ORMModel):
    id: uuid.UUID
    order_id: uuid.UUID
    line_id: uuid.UUID | None
    kind: FlagKind
    issue: str
    quote: str
    why: str
    options: list[dict]
    confidence: int
    status: FlagStatus
    resolved_option: dict | None
    created_at: datetime


class FlagWithOrder(FlagOut):
    order_number: str
    retailer_name: str | None


class RetailerBrief(ORMModel):
    id: uuid.UUID
    name: str
    market: str | None
    phone: str | None


class OrderSummary(ORMModel):
    id: uuid.UUID
    number: str
    channel: Channel
    status: OrderStatus
    subtotal: Money
    retailer: RetailerBrief | None
    retailer_name_guess: str | None
    created_at: datetime
    confirmed_at: datetime | None
    paid_at: datetime | None
    item_count: int = 0
    open_flags: int = 0


class OrderDetail(OrderSummary):
    lines: list[LineOut]
    evidence: list[EvidenceOut]
    flags: list[FlagOut]
    owner_user_id: uuid.UUID | None


class OrderCreate(BaseModel):
    retailer_id: uuid.UUID | None = None
    lines: list[LineIn] = Field(min_length=1)


class LinesReplace(BaseModel):
    lines: list[LineIn]


class ConfirmRequest(BaseModel):
    force: bool = False


class ResolveFlag(BaseModel):
    option_index: int = Field(ge=0)


class DashboardSummary(BaseModel):
    orders_today: int
    orders_yesterday: int
    pending_verifications: int
    verification_breakdown: dict[str, int]  # ai_flag / transfer / duplicate
    receivables: Money
    invoiced: Money
    collected: Money


class NotificationOut(ORMModel):
    id: uuid.UUID
    kind: str
    title: str
    detail: str
    order_id: uuid.UUID | None
    read_at: datetime | None
    created_at: datetime
