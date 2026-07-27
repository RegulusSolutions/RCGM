import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import UserRole
from app.models.guest import Guest, GuestPreference
from app.schemas.common import Page, paginate_query

router = APIRouter(prefix="/api/guests", tags=["guests"])

READ_ROLES = (
    UserRole.TENANT_ADMIN,
    UserRole.COORDINATOR,
    UserRole.RESERVATIONS,
    UserRole.MANAGER,
    UserRole.MARKETING,
)


class PreferencesOut(BaseModel):
    dietary: str | None = None
    beverage: str | None = None
    room: str | None = None
    language: str | None = None
    vip_level: str | None = None
    signboard_name: str | None = None
    notes: str | None = None

    class Config:
        from_attributes = True


class GuestOut(BaseModel):
    id: uuid.UUID
    name: str
    membership_no: str
    nationality: str | None
    mobile: str | None
    whatsapp: str | None
    email: str | None
    passport_no: str | None
    passport_expiry: date | None
    dob: date | None
    visa_status: str | None
    preferences: PreferencesOut | None = None

    class Config:
        from_attributes = True


@router.get("", response_model=Page[GuestOut])
def list_guests(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*READ_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    q = db.query(Guest).filter(Guest.tenant_id == tenant_id)
    if search:
        like = f"%{search}%"
        q = q.filter((Guest.name.ilike(like)) | (Guest.membership_no.ilike(like)))
    q = q.order_by(Guest.created_at.desc())
    items, total, total_pages = paginate_query(q, page, page_size)
    return Page(items=items, page=page, page_size=page_size, total=total, total_pages=total_pages)


@router.get("/lookup")
def lookup_by_membership(
    membership_no: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*READ_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    """Recurring-guest lookup used by the Marketing request wizard."""
    if not membership_no or membership_no.strip().upper() == "NEW":
        return None
    guest = (
        db.query(Guest)
        .filter(Guest.tenant_id == tenant_id, Guest.membership_no.ilike(membership_no.strip()))
        .first()
    )
    if not guest:
        return None
    from app.models.trip import Trip

    last_trip = (
        db.query(Trip)
        .filter(Trip.tenant_id == tenant_id, Trip.guest_id == guest.id)
        .order_by(Trip.created_at.desc())
        .first()
    )
    return {
        "guest": GuestOut.model_validate(guest),
        "last_trip": {"trip_no": last_trip.trip_no, "arrival_date": last_trip.arrival_date, "departure_date": last_trip.departure_date} if last_trip else None,
    }


@router.get("/{guest_id}", response_model=GuestOut)
def get_guest(
    guest_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*READ_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    guest = db.query(Guest).filter(Guest.id == guest_id, Guest.tenant_id == tenant_id).first()
    if not guest:
        raise not_found("Guest not found.")
    return guest
