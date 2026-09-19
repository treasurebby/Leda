"""Evidence storage: S3-compatible bucket in production, backend/media on disk otherwise."""

import asyncio
import uuid
from pathlib import Path
from typing import Protocol

from app.core.config import settings


class Storage(Protocol):
    async def put(self, key: str, content: bytes, mime: str) -> None: ...
    async def get(self, key: str) -> tuple[bytes, str] | None: ...


def new_key(business_id: uuid.UUID, kind: str, mime: str) -> str:
    ext = {
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/wav": "wav",
        "audio/webm": "webm",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }.get(mime.split(";")[0], "bin")
    return f"{business_id}/{kind}/{uuid.uuid4().hex}.{ext}"


class DiskStorage:
    def __init__(self, root: Path):
        self.root = root

    async def put(self, key: str, content: bytes, mime: str) -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, content)
        await asyncio.to_thread((path.with_suffix(path.suffix + ".mime")).write_text, mime)

    async def get(self, key: str) -> tuple[bytes, str] | None:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()) or not path.exists():
            return None
        mime_file = path.with_suffix(path.suffix + ".mime")
        mime = mime_file.read_text() if mime_file.exists() else "application/octet-stream"
        return await asyncio.to_thread(path.read_bytes), mime


class S3Storage:
    def __init__(self, bucket: str):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region,
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
            # Supabase Storage (and most non-AWS S3 endpoints) need the bucket in the path, not the hostname.
            config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
        )

    async def put(self, key: str, content: bytes, mime: str) -> None:
        await asyncio.to_thread(self.client.put_object, Bucket=self.bucket, Key=key, Body=content, ContentType=mime)

    async def get(self, key: str) -> tuple[bytes, str] | None:
        try:
            obj = await asyncio.to_thread(self.client.get_object, Bucket=self.bucket, Key=key)
        except self.client.exceptions.NoSuchKey:
            return None
        return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")


_default: Storage | None = None


def get_storage() -> Storage:
    global _default
    if _default is None:
        _default = S3Storage(settings.s3_bucket) if settings.s3_bucket else DiskStorage(settings.media_dir)
    return _default


def set_storage(storage: Storage | None) -> None:
    global _default
    _default = storage
