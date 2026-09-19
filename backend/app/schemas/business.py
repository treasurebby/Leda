from pydantic import BaseModel, Field, field_validator

from app.core.security import normalise_phone
from app.models import BridgeMethod


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    industry: str | None = Field(default=None, max_length=120)
    custom_industry: str | None = Field(default=None, max_length=120)
    auto_reply: bool | None = None


class BridgeUpdate(BaseModel):
    """Onboarding step 2."""

    method: BridgeMethod
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        normalised = normalise_phone(v)
        if not normalised:
            raise ValueError("Enter a valid Nigerian mobile number")
        return normalised
