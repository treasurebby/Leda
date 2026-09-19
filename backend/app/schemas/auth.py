import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import normalise_phone, valid_password
from app.models import Role
from app.schemas.common import ORMModel


class RegisterRequest(BaseModel):
    """Onboarding step 1: owner identity + business in one call."""

    full_name: str = Field(min_length=2, max_length=120)
    phone: str
    email: EmailStr
    password: str
    business_name: str = Field(min_length=2, max_length=120)
    industry: str = Field(min_length=1, max_length=120)
    custom_industry: str | None = Field(default=None, max_length=120)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        normalised = normalise_phone(v)
        if not normalised:
            raise ValueError("Enter a valid Nigerian mobile number")
        return normalised

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if not valid_password(v):
            raise ValueError("Use at least 8 characters, with a letter and a number.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember: bool = True


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=128)
    password: str = Field(max_length=128)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        if not valid_password(value):
            raise ValueError("Use at least 8 characters, with a letter and a number.")
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    phone: str | None
    full_name: str
    created_at: datetime


class BusinessSummary(ORMModel):
    id: uuid.UUID
    name: str
    industry: str
    custom_industry: str | None
    bridge_method: str | None
    whatsapp_number: str | None
    onboarding_completed: bool


class MeResponse(BaseModel):
    user: UserOut
    business: BusinessSummary
    role: Role
