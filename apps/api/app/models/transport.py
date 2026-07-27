import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import (
    BookingLevel,
    PaymentStatus,
    RateBasis,
    TransportLegType,
    TransportSource,
    UsageType,
)
from app.models.mixins import TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum


class TransportLeg(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "transport_legs"
    __table_args__ = (
        CheckConstraint("(trip_id IS NOT NULL) OR (group_id IS NOT NULL)", name="ck_leg_owner"),
        CheckConstraint(
            "(source = 'inhouse' AND vehicle_id IS NOT NULL AND vendor_id IS NULL) OR "
            "(source = 'vendor' AND vendor_id IS NOT NULL AND vehicle_id IS NULL)",
            name="ck_leg_source_consistency",
        ),
        Index("ix_leg_vehicle_time", "vehicle_id", "scheduled_at"),
    )

    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=True
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trip_groups.id", ondelete="CASCADE"), nullable=True
    )
    level: Mapped[BookingLevel] = mapped_column(pg_enum(BookingLevel, "booking_level"), default=BookingLevel.GUEST)

    leg_type: Mapped[TransportLegType] = mapped_column(pg_enum(TransportLegType, "transport_leg_type"))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    source: Mapped[TransportSource] = mapped_column(pg_enum(TransportSource, "transport_source"))
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=True)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vendors.id"), nullable=True
    )
    vendor_vehicle_type: Mapped[str | None] = mapped_column(String(80))

    usage_type: Mapped[UsageType | None] = mapped_column(pg_enum(UsageType, "usage_type"), nullable=True)
    rate_basis: Mapped[RateBasis | None] = mapped_column(pg_enum(RateBasis, "rate_basis"), nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(6), default="LKR")
    lkr_equivalent: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    payment_status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING
    )
    payment_method: Mapped[str | None] = mapped_column(String(80))
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    destination_notes: Mapped[str | None] = mapped_column(String)
    is_assigned: Mapped[bool] = mapped_column(Boolean, default=True)
    completed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    cancel_reason: Mapped[str | None] = mapped_column(String)
    cancel_charge: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
