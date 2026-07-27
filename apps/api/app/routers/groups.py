import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import TripStatus, UserRole
from app.models.guest import Guest
from app.models.trip import Trip, TripGroup
from app.services.audit import record_event
from app.services.trip_numbering import next_group_no

router = APIRouter(prefix="/api/groups", tags=["groups"])

READ_ROLES = (UserRole.COORDINATOR, UserRole.TENANT_ADMIN, UserRole.MANAGER)


class GroupCreate(BaseModel):
    name: str
    date_from: date | None = None
    date_to: date | None = None
    notes: str | None = None


def _serialize(g: TripGroup, member_count: int) -> dict:
    return {
        "id": str(g.id), "group_no": g.group_no, "name": g.name,
        "date_from": g.date_from.isoformat() if g.date_from else None,
        "date_to": g.date_to.isoformat() if g.date_to else None,
        "notes": g.notes, "member_count": member_count,
    }


@router.get("")
def list_groups(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    groups = db.query(TripGroup).filter(TripGroup.tenant_id == tenant_id).order_by(TripGroup.created_at.desc()).all()
    return [_serialize(g, db.query(Trip).filter(Trip.group_id == g.id).count()) for g in groups]


@router.post("")
def create_group(payload: GroupCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    if not payload.name.strip():
        raise bad_request("Group name is required.")
    group = TripGroup(tenant_id=tenant_id, group_no=next_group_no(db, tenant_id), name=payload.name.strip(), date_from=payload.date_from, date_to=payload.date_to, notes=payload.notes, created_by=current_user.id)
    db.add(group)
    db.commit()
    db.refresh(group)
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, action="GROUP_CREATED", description=f"Trip group {group.group_no} ({group.name}) created")
    return _serialize(group, 0)


@router.get("/{group_id}")
def get_group(group_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    group = db.query(TripGroup).filter(TripGroup.id == group_id, TripGroup.tenant_id == tenant_id).first()
    if not group:
        raise not_found("Group not found.")
    members = db.query(Trip).filter(Trip.group_id == group.id).all()
    member_out = []
    for t in members:
        guest = db.query(Guest).filter(Guest.id == t.guest_id).first()
        member_out.append({"id": str(t.id), "trip_no": t.trip_no, "guest_name": guest.name if guest else None, "status": t.status.value, "arrival_date": t.arrival_date.isoformat(), "departure_date": t.departure_date.isoformat()})
    return {**_serialize(group, len(members)), "members": member_out}


@router.post("/{group_id}/assign/{trip_id}")
def assign_trip(group_id: uuid.UUID, trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    group = db.query(TripGroup).filter(TripGroup.id == group_id, TripGroup.tenant_id == tenant_id).first()
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not group or not trip:
        raise not_found("Group or trip not found.")
    old = trip.group.group_no if trip.group_id and trip.group else "—"
    trip.group_id = group.id
    db.commit()
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id, action="GROUP_ASSIGNED", description="Group assignment changed", old_value=old, new_value=group.group_no)
    return {"ok": True}


@router.post("/unassign/{trip_id}")
def unassign_trip(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    old = trip.group.group_no if trip.group_id and trip.group else "—"
    trip.group_id = None
    db.commit()
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id, action="GROUP_ASSIGNED", description="Group assignment changed", old_value=old, new_value="—")
    return {"ok": True}
