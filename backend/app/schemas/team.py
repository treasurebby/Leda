import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import normalise_phone, valid_password
from app.models import ROLE_LABELS, Role
from app.schemas.common import ORMModel


def coerce_role(value: str | Role) -> Role:
    """Accept either the internal role key or the label shown in the onboarding UI."""
    if isinstance(value, Role):
        return value
    if value in ROLE_LABELS:
        return ROLE_LABELS[value]
    try:
        return Role(value)
    except ValueError as exc:
        raise ValueError(f"Unknown role '{value}'") from exc


class InviteCreate(BaseModel):
    email: EmailStr
    phone: str | None = None
    role: Role

    @field_validator("role", mode="before")
    @classmethod
    def _role(cls, v):
        role = coerce_role(v)
        if role == Role.owner:
            raise ValueError("Owner role cannot be invited")
        return role

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if not v:
            return None
        normalised = normalise_phone(v)
        if not normalised:
            raise ValueError("Enter a valid Nigerian mobile number")
        return normalised


class InviteOut(ORMModel):
    id: uuid.UUID
    email: str
    phone: str | None
    role: Role
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime


class InviteAccept(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    password: str

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if not valid_password(v):
            raise ValueError("Use at least 8 characters, with a letter and a number.")
        return v


class MemberOut(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    phone: str | None
    full_name: str
    role: Role
    joined_at: datetime


class RoleUpdate(BaseModel):
    role: Role

    @field_validator("role", mode="before")
    @classmethod
    def _role(cls, v):
        role = coerce_role(v)
        if role == Role.owner:
            raise ValueError("Use ownership transfer to assign the owner role")
        return role


class TeamResponse(BaseModel):
    members: list[MemberOut]
    invites: list[InviteOut]
