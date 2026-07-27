import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ExpenseCategory, PackageFlagStatus, PaymentStatus
from app.models.mixins import TenantScopedMixin, UUIDPrimaryKeyMixin, pg_enum


class ExpenseSummary(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    """Versioned, append-only snapshot. Regenerating NEVER overwrites a prior row —
    a new version is inserted and `is_current` flips. This closes the prototype's
    documented gap (it overwrote `trip.expenseGen` in place with no history)."""

    __tablename__ = "expense_summaries"
    __table_args__ = (UniqueConstraint("trip_id", "version"),)

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)

    flight_total_lkr: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    hotel_total_lkr: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    transport_total_lkr: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    visa_total_lkr: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    grand_total_lkr: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    outstanding_total_lkr: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    items: Mapped[list["ExpenseSummaryItem"]] = relationship(back_populates="summary", cascade="all, delete-orphan")


class ExpenseSummaryItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "expense_summary_items"

    expense_summary_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_summaries.id", ondelete="CASCADE")
    )
    category: Mapped[ExpenseCategory] = mapped_column(pg_enum(ExpenseCategory, "expense_category"))
    description: Mapped[str] = mapped_column(String, nullable=False)
    currency: Mapped[str] = mapped_column(String(6), default="LKR")
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    lkr_equivalent: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    payment_status: Mapped[str | None] = mapped_column(String(20))
    is_shared_group: Mapped[bool] = mapped_column(Boolean, default=False)
    source_type: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    summary: Mapped[ExpenseSummary] = relationship(back_populates="items")


class PackageQualificationFlag(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    """History-preserving: prior decisions kept with is_current=false rather than
    overwritten, unlike the prototype's single `trip.packageFlag` field."""

    __tablename__ = "package_qualification_flags"

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    status: Mapped[PackageFlagStatus] = mapped_column(pg_enum(PackageFlagStatus, "package_flag_status"))
    set_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(String)
    set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
