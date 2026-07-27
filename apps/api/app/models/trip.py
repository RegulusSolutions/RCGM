import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ChecklistItemKey, NoteType, PackageFlagStatus, TripStatus
from app.models.mixins import TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum


class TripGroup(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "trip_groups"
    __table_args__ = (UniqueConstraint("tenant_id", "group_no"),)

    group_no: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    date_from: Mapped[date | None] = mapped_column(Date)
    date_to: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    trips: Mapped[list["Trip"]] = relationship(back_populates="group")


class Trip(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "trips"
    __table_args__ = (
        UniqueConstraint("tenant_id", "trip_no"),
        CheckConstraint("departure_date >= arrival_date", name="ck_trip_dates_order"),
    )

    trip_no: Mapped[str] = mapped_column(String(60), nullable=False)
    guest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("guests.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trip_groups.id", ondelete="SET NULL"), nullable=True
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketing_agents.id", ondelete="SET NULL"), nullable=True
    )
    package_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packages.id", ondelete="SET NULL"), nullable=True
    )
    arrival_date: Mapped[date] = mapped_column(Date, nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[TripStatus] = mapped_column(
        pg_enum(TripStatus, "trip_status"), default=TripStatus.DRAFT, nullable=False
    )
    package_flag: Mapped[PackageFlagStatus] = mapped_column(
        pg_enum(PackageFlagStatus, "package_flag_status"), default=PackageFlagStatus.PENDING
    )
    notes: Mapped[str | None] = mapped_column(String)
    cancel_reason: Mapped[str | None] = mapped_column(String)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    group: Mapped[TripGroup | None] = relationship(back_populates="trips")
    companions: Mapped[list["Companion"]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    clearances: Mapped[list["TripClearance"]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    trip_notes: Mapped[list["TripNote"]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    handovers: Mapped[list["TripHandover"]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    checklist_items: Mapped[list["TripChecklistItem"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )


class Companion(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "companions"

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    relationship_: Mapped[str | None] = mapped_column("relationship", String(80))
    passport_no: Mapped[str | None] = mapped_column(String(40))
    passport_expiry: Mapped[date | None] = mapped_column(Date)
    dob: Mapped[date | None] = mapped_column(Date)
    nationality: Mapped[str | None] = mapped_column(String(80))
    visa_status: Mapped[str | None] = mapped_column(String(40))

    trip: Mapped[Trip] = relationship(back_populates="companions")


class TripClearance(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = "trip_clearances"

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    cleared_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
    reference: Mapped[str] = mapped_column(String(300), nullable=False)
    cleared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_override: Mapped[bool] = mapped_column(Boolean, default=False)
    override_reason: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    trip: Mapped[Trip] = relationship(back_populates="clearances")


class TripNote(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    __tablename__ = "trip_notes"

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    note_type: Mapped[NoteType] = mapped_column(pg_enum(NoteType, "note_type"), default=NoteType.GENERAL)
    text: Mapped[str] = mapped_column(String, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    trip: Mapped[Trip] = relationship(back_populates="trip_notes")


class TripHandover(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    """Append-only: a new handover never overwrites an unacknowledged one in place —
    the previous row is stamped with superseded_at instead (task brief requirement,
    a gap in the original prototype which simply overwrote the single handover object).
    """

    __tablename__ = "trip_handovers"

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    trip: Mapped[Trip] = relationship(back_populates="handovers")


class TripChecklistItem(UUIDPrimaryKeyMixin, TenantScopedMixin, Base):
    """Stores ONLY the not-applicable override; the green/open lamp state itself is
    always computed live from bookings/legs/visas/expense summaries (never persisted),
    matching the prototype's `lampState()` derivation model.
    """

    __tablename__ = "trip_checklist_items"
    __table_args__ = (UniqueConstraint("trip_id", "item_key"),)

    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    item_key: Mapped[ChecklistItemKey] = mapped_column(pg_enum(ChecklistItemKey, "checklist_item_key"))
    is_not_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    na_reason: Mapped[str | None] = mapped_column(String)
    na_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    na_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    trip: Mapped[Trip] = relationship(back_populates="checklist_items")
