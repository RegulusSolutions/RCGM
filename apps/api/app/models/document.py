import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import DocumentCategory, DocumentOwnerType
from app.models.mixins import TenantScopedMixin, UUIDPrimaryKeyMixin, pg_enum


class Document(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    """Metadata only — the actual bytes live on disk (or later S3/R2/MinIO) under a
    randomized storage_key. Never expose storage_key to API clients.
    """

    __tablename__ = "documents"

    trip_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=True)
    owner_type: Mapped[DocumentOwnerType] = mapped_column(pg_enum(DocumentOwnerType, "document_owner_type"))
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    category: Mapped[DocumentCategory] = mapped_column(pg_enum(DocumentCategory, "document_category"))

    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_reason: Mapped[str | None] = mapped_column(String)
