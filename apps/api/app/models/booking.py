import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import BookingLevel, BookingStatus, PaymentStatus, VisaStatus, VisaTravellerType
from app.models.mixins import TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum


class FlightBooking(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "flight_bookings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "booking_no"),
        CheckConstraint("(trip_id IS NOT NULL) OR (group_id IS NOT NULL)", name="ck_flight_owner"),
    )

    booking_no: Mapped[str] = mapped_column(String(60), nullable=False)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=True
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trip_groups.id", ondelete="CASCADE"), nullable=True
    )
    level: Mapped[BookingLevel] = mapped_column(pg_enum(BookingLevel, "booking_level"), default=BookingLevel.GUEST)

    airline_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("airlines.id"), nullable=True)
    airline_name: Mapped[str] = mapped_column(String(200), nullable=False)
    travel_class: Mapped[str] = mapped_column(String(60), nullable=False)
    flight_numbers: Mapped[str] = mapped_column(String(120), nullable=False)
    pnr: Mapped[str | None] = mapped_column(String(20))
    route: Mapped[str | None] = mapped_column(String(120))
    ticket_count: Mapped[int] = mapped_column(Integer, default=1)
    arrival_datetime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    return_datetime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    currency: Mapped[str] = mapped_column(String(6), default="LKR")
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    lkr_equivalent: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    payment_status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING
    )
    payment_method: Mapped[str | None] = mapped_column(String(80))
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    booking_status: Mapped[BookingStatus] = mapped_column(
        pg_enum(BookingStatus, "booking_status"), default=BookingStatus.DRAFT
    )
    cancellation_charge: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    cancellation_charge_lkr: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String)

    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class HotelBooking(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "hotel_bookings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "booking_no"),
        CheckConstraint("(trip_id IS NOT NULL) OR (group_id IS NOT NULL)", name="ck_hotel_owner"),
        CheckConstraint("check_out > check_in", name="ck_hotel_dates_order"),
    )

    booking_no: Mapped[str] = mapped_column(String(60), nullable=False)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=True
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trip_groups.id", ondelete="CASCADE"), nullable=True
    )
    level: Mapped[BookingLevel] = mapped_column(pg_enum(BookingLevel, "booking_level"), default=BookingLevel.GUEST)

    hotel_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("hotels.id"), nullable=True)
    hotel_name: Mapped[str] = mapped_column(String(200), nullable=False)
    room_type: Mapped[str] = mapped_column(String(120), nullable=False)
    room_count: Mapped[int] = mapped_column(Integer, default=1)
    night_count: Mapped[int] = mapped_column(Integer, default=1)
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    confirmation_no: Mapped[str | None] = mapped_column(String(60))
    meal_plan: Mapped[str | None] = mapped_column(String(20))
    rate_per_night: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    currency: Mapped[str] = mapped_column(String(6), default="LKR")
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    lkr_equivalent: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    payment_status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING
    )
    payment_method: Mapped[str | None] = mapped_column(String(80))
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    booking_status: Mapped[BookingStatus] = mapped_column(
        pg_enum(BookingStatus, "booking_status"), default=BookingStatus.DRAFT
    )
    cancellation_charge: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    cancellation_charge_lkr: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String)

    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class VisaApplication(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "visa_applications"
    __table_args__ = (UniqueConstraint("trip_id", "traveller_ref_id"),)

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    traveller_type: Mapped[VisaTravellerType] = mapped_column(pg_enum(VisaTravellerType, "visa_traveller_type"))
    traveller_ref_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    traveller_name: Mapped[str] = mapped_column(String(200), nullable=False)
    passport_no: Mapped[str | None] = mapped_column(String(40))
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[VisaStatus] = mapped_column(pg_enum(VisaStatus, "visa_status"), default=VisaStatus.TO_APPLY)
    eta_reference: Mapped[str | None] = mapped_column(String(80))
    application_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    fee_usd: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    lkr_equivalent: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING
    )
    reason: Mapped[str | None] = mapped_column(String)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
