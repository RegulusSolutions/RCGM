import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Tenant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), default="LKR", nullable=False)
    guest_link_expiry_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    seq_trip: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    seq_group: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    seq_booking: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    settings: Mapped["TenantSettings"] = relationship(
        back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )


class TenantSettings(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "tenant_settings"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True
    )

    flight_amber_days: Mapped[int] = mapped_column(Integer, default=7)
    flight_red_hrs: Mapped[int] = mapped_column(Integer, default=72)
    hotel_amber_days: Mapped[int] = mapped_column(Integer, default=7)
    hotel_red_hrs: Mapped[int] = mapped_column(Integer, default=72)
    visa_amber_days: Mapped[int] = mapped_column(Integer, default=7)
    visa_red_hrs: Mapped[int] = mapped_column(Integer, default=72)
    pickup_amber_hrs: Mapped[int] = mapped_column(Integer, default=48)
    pickup_red_hrs: Mapped[int] = mapped_column(Integer, default=24)
    drop_amber_hrs: Mapped[int] = mapped_column(Integer, default=24)
    drop_red_hrs: Mapped[int] = mapped_column(Integer, default=12)

    tenant: Mapped[Tenant] = relationship(back_populates="settings")
