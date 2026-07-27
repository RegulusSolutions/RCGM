"""File storage abstraction.

`StorageBackend` is the interface every calling code depends on; `LocalDiskBackend`
is the localhost implementation used today. A later `S3Backend` / `R2Backend` /
`MinioBackend` can be dropped in without touching any router or service that
calls `save_file` / `open_file` / `delete_file`, per the task brief's requirement
that the storage layer be swap-ready.
"""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol

from app.config import get_settings

settings = get_settings()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "application/pdf"}


@dataclass
class StoredFile:
    storage_key: str
    size_bytes: int


class StorageBackend(Protocol):
    def save(self, tenant_id: str, filename: str, mime_type: str, data: bytes) -> StoredFile: ...
    def open_stream(self, storage_key: str) -> BinaryIO: ...
    def delete(self, storage_key: str) -> None: ...


class LocalDiskBackend:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _ext_for(self, filename: str) -> str:
        _, ext = os.path.splitext(filename)
        return ext.lower() if ext else ""

    def save(self, tenant_id: str, filename: str, mime_type: str, data: bytes) -> StoredFile:
        tenant_dir = self.base_dir / tenant_id
        tenant_dir.mkdir(parents=True, exist_ok=True)
        random_name = f"{secrets.token_hex(24)}{self._ext_for(filename)}"
        storage_key = f"{tenant_id}/{random_name}"
        with open(self.base_dir / storage_key, "wb") as f:
            f.write(data)
        return StoredFile(storage_key=storage_key, size_bytes=len(data))

    def open_stream(self, storage_key: str) -> BinaryIO:
        return open(self.base_dir / storage_key, "rb")

    def delete(self, storage_key: str) -> None:
        path = self.base_dir / storage_key
        if path.exists():
            path.unlink()


def validate_upload(mime_type: str, size_bytes: int) -> str | None:
    if mime_type not in ALLOWED_MIME_TYPES:
        return "Only JPG, PNG or PDF files are accepted."
    if size_bytes > settings.max_upload_size_mb * 1024 * 1024:
        return f"File exceeds the {settings.max_upload_size_mb} MB limit."
    return None


_backend: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    global _backend
    if _backend is None:
        _backend = LocalDiskBackend(settings.upload_storage_dir)
    return _backend
