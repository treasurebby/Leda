import hashlib
import re
import secrets
import uuid
from datetime import timedelta
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import settings
from app.core.db import utcnow

_hasher = PasswordHash.recommended()  # argon2id

PASSWORD_RE_LETTER = re.compile(r"[A-Za-z]")
PASSWORD_RE_DIGIT = re.compile(r"\d")


def valid_password(value: str) -> bool:
    """Same rule as the onboarding UI: at least 8 chars with a letter and a number."""
    return len(value) >= 8 and bool(PASSWORD_RE_LETTER.search(value)) and bool(PASSWORD_RE_DIGIT.search(value))


def hash_password(raw: str) -> str:
    return _hasher.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return _hasher.verify(raw, hashed)


def normalise_phone(value: str) -> str | None:
    """Port of frontend normalisePhone: returns E.164 (+234XXXXXXXXXX) or None."""
    digits = re.sub(r"[\s()+.\-]", "", value or "")
    if digits.startswith("234"):
        local = digits[3:]
    elif digits.startswith("0"):
        local = digits[1:]
    else:
        local = digits
    return f"+234{local}" if re.fullmatch(r"[789]\d{9}", local) else None


# ---------------------------------------------------------------- JWT access tokens
def create_access_token(user_id: uuid.UUID, business_id: uuid.UUID | None) -> str:
    now = utcnow()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "biz": str(business_id) if business_id else None,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
        "typ": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("typ") == "access" else None


# ---------------------------------------------------------------- opaque tokens (refresh, invites)
def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
