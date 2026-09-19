from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["dev", "test", "prod"] = "dev"
    secret_key: str = "dev-only-secret-change-me"
    database_url: str = "postgresql+asyncpg://leda:leda@localhost:5432/leda"
    cors_origins: str = "http://localhost:5173"

    access_token_minutes: int = 15
    refresh_token_days: int = 30
    invite_token_days: int = 7

    email_from: str = "Leda <hello@leda.africa>"
    resend_api_key: str = ""
    public_app_url: str = "http://localhost:5173"

    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = "auto"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    media_dir: Path = BACKEND_DIR / "media"

    paystack_secret_key: str = ""

    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = "leda-verify"
    whatsapp_app_secret: str = ""

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5"
    whisper_model: str = "whisper-1"

    import_max_bytes: int = 5 * 1024 * 1024
    import_max_rows: int = 5000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.app_env != "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
