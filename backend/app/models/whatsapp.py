import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TZDateTime, utcnow, uuid_pk
from app.models.common import JSONType


class WhatsAppMessage(Base):
    """Inbound log; the unique wa_message_id makes webhook redelivery a no-op."""

    __tablename__ = "whatsapp_messages"

    id: Mapped[uuid_pk]
    business_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    wa_message_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    from_number: Mapped[str] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    media_id: Mapped[str | None] = mapped_column(String(128))
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    error: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
