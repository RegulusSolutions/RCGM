import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Guest(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "guests"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    membership_no: Mapped[str] = mapped_column(String(60), nullable=False)
    nationality: Mapped[str | None] = mapped_column(String(80))
    mobile: Mapped[str | None] = mapped_column(String(40))
    whatsapp: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(200))
    passport_no: Mapped[str | None] = mapped_column(String(40))
    passport_expiry: Mapped[date | None] = mapped_column(Date)
    dob: Mapped[date | None] = mapped_column(Date)
    visa_status: Mapped[str | None] = mapped_column(String(40))
    additional_notes: Mapped[str | None] = mapped_column(String)

    preferences: Mapped["GuestPreference"] = relationship(
        back_populates="guest", uselist=False, cascade="all, delete-orphan"
    )


class GuestPreference(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "guest_preferences"

    guest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("guests.id", ondelete="CASCADE"), unique=True
    )
    dietary: Mapped[str | None] = mapped_column(String(200))
    beverage: Mapped[str | None] = mapped_column(String(200))
    room: Mapped[str | None] = mapped_column(String(200))
    language: Mapped[str | None] = mapped_column(String(120))
    vip_level: Mapped[str | None] = mapped_column(String(80))
    signboard_name: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(String)

    guest: Mapped[Guest] = relationship(back_populates="preferences")
