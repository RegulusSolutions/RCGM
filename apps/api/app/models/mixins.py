import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


def _now() -> datetime:
    return datetime.now(timezone.utc)


def pg_enum(enum_cls, name: str) -> SAEnum:
    """Postgres native ENUM column type that stores each member's `.value`
    (e.g. "Partially Paid", "Arrival Pickup") rather than SQLAlchemy's default
    of the member `.name` (e.g. "PARTIALLY_PAID"). Every enum-backed column in
    this codebase must go through this helper so that the stored text always
    matches the `.value` strings used in API payloads, CHECK constraints, and
    application comparisons."""
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )


class TenantScopedMixin:
    """Adds a mandatory tenant_id FK + index used by every tenant-owned table."""

    @classmethod
    def __declare_last__(cls):  # pragma: no cover - SQLAlchemy hook, no logic
        pass

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), index=True
    )
