import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models import LedgerKind, PaymentStatus
from app.schemas.common import Money, ORMModel


class PaymentOut(ORMModel):
    id: uuid.UUID
    retailer_id: uuid.UUID | None
    retailer_name: str | None = None
    order_id: uuid.UUID | None
    order_number: str | None = None
    provider: str
    provider_reference: str
    amount: Money
    received_at: datetime | None
    status: PaymentStatus
    detail: str | None
    created_at: datetime


class MatchRequest(BaseModel):
    order_id: uuid.UUID


class LedgerEntryOut(ORMModel):
    id: uuid.UUID
    retailer_id: uuid.UUID | None
    retailer_name: str | None = None
    order_id: uuid.UUID | None
    order_number: str | None = None
    kind: LedgerKind
    debit: Money
    credit: Money
    balance: Money  # running balance across the returned window
    memo: str
    created_at: datetime


class LedgerPage(BaseModel):
    items: list[LedgerEntryOut]
    opening_balance: Money
    closing_balance: Money


class BalanceOut(BaseModel):
    retailer_id: uuid.UUID
    balance: Money


class SimulateCredit(BaseModel):
    """Dev only: pretend Paystack credited a retailer's virtual account."""

    amount: Money
    reference: str | None = None
    account_number: str | None = None
    retailer_id: uuid.UUID | None = None
    narration: str | None = None
