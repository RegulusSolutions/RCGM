"""Transport legs — assignment/completion by Coordinator or Transport, cost
fields hidden from Transport at the serialization layer (never just the UI),
plus vehicle double-booking conflict detection (a documented enhancement over
the prototype — feature-inventory.md §9)."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.permissions import CAN_CANCEL_TRANSPORT_LEG, CAN_EDIT_TRANSPORT_LEGS, CAN_SEE_TRANSPORT_COST
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import (
    BookingLevel,
    NotificationRole,
    PaymentStatus,
    RateBasis,
    TransportLegType,
    TransportSource,
    UsageType,
    UserRole,
)
from app.models.master_data import Driver, TransportVendor, Vehicle
from app.models.trip import Trip
from app.models.transport import TransportLeg
from app.services.audit import record_event
from app.services.notifications import notify_role
from app.services.transport_conflict import find_conflicts

router = APIRouter(prefix="/api/transport", tags=["transport"])

READ_ROLES = (UserRole.COORDINATOR, UserRole.TRANSPORT, UserRole.TENANT_ADMIN, UserRole.MANAGER)


def _out(db: Session, leg: TransportLeg, show_cost: bool) -> dict:
    vehicle = db.query(Vehicle).filter(Vehicle.id == leg.vehicle_id).first() if leg.vehicle_id else None
    driver = db.query(Driver).filter(Driver.id == vehicle.driver_id).first() if vehicle and vehicle.driver_id else None
    vendor = db.query(TransportVendor).filter(TransportVendor.id == leg.vendor_id).first() if leg.vendor_id else None
    out = {
        "id": str(leg.id), "leg_type": leg.leg_type.value, "scheduled_at": leg.scheduled_at.isoformat(),
        "level": leg.level.value, "source": leg.source.value,
        "vehicle_id": str(leg.vehicle_id) if leg.vehicle_id else None,
        "vehicle_no": vehicle.vehicle_no if vehicle else None,
        "vehicle_type": vehicle.vehicle_type if vehicle else None,
        "driver_name": driver.name if driver else None,
        "driver_mobile": driver.mobile if driver else None,
        "vendor_id": str(leg.vendor_id) if leg.vendor_id else None,
        "vendor_name": vendor.name if vendor else None,
        "vendor_vehicle_type": leg.vendor_vehicle_type,
        "usage_type": leg.usage_type.value if leg.usage_type else None,
        "destination_notes": leg.destination_notes, "is_assigned": leg.is_assigned,
        "completed_at": leg.completed_at.isoformat() if leg.completed_at else None,
        "is_cancelled": leg.is_cancelled, "cancel_reason": leg.cancel_reason,
    }
    if show_cost:
        out.update(
            {
                "rate_basis": leg.rate_basis.value if leg.rate_basis else None,
                "amount": float(leg.amount) if leg.amount is not None else None,
                "currency": leg.currency,
                "lkr_equivalent": float(leg.lkr_equivalent) if leg.lkr_equivalent is not None else None,
                "payment_status": leg.payment_status.value,
                "cancel_charge": float(leg.cancel_charge) if leg.cancel_charge is not None else None,
            }
        )
    return out


@router.get("/legs")
def list_legs(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    q = db.query(TransportLeg).filter(TransportLeg.tenant_id == tenant_id)
    q = q.filter((TransportLeg.trip_id == trip.id) | (TransportLeg.group_id == trip.group_id if trip.group_id else False))
    show_cost = current_user.role in CAN_SEE_TRANSPORT_COST
    return [_out(db, l, show_cost) for l in q.all()]


class LegIn(BaseModel):
    trip_id: uuid.UUID
    level: str = "guest"
    leg_type: TransportLegType
    scheduled_at: datetime
    source: TransportSource
    vehicle_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    vendor_vehicle_type: str | None = None
    usage_type: UsageType | None = None
    destination_notes: str | None = None
    rate_basis: RateBasis | None = None
    amount: float | None = None
    currency: str = "LKR"
    lkr_equivalent: float | None = None
    override: bool = False
    override_reason: str | None = None


@router.post("/legs")
def create_leg(payload: LegIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_TRANSPORT_LEGS)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == payload.trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    if payload.source == TransportSource.INHOUSE and not payload.vehicle_id:
        raise bad_request("A vehicle + driver is required for an in-house leg.")
    if payload.source == TransportSource.VENDOR and not payload.vendor_id:
        raise bad_request("A vendor is required.")

    if payload.source == TransportSource.INHOUSE:
        conflicts = find_conflicts(db, payload.vehicle_id, payload.scheduled_at)
        if conflicts and not payload.override:
            raise conflict(
                f"This vehicle already has {len(conflicts)} leg(s) scheduled near this time. "
                "Resubmit with override=true and an override_reason to proceed anyway."
            )
        if conflicts and payload.override and not (payload.override_reason and payload.override_reason.strip()):
            raise bad_request("An override reason is required.")

    owner = {"trip_id": trip.id, "group_id": None, "level": BookingLevel.GUEST}
    if payload.level == "group" and trip.group_id:
        owner = {"trip_id": None, "group_id": trip.group_id, "level": BookingLevel.GROUP}

    show_cost = current_user.role in CAN_SEE_TRANSPORT_COST
    leg = TransportLeg(
        tenant_id=tenant_id, leg_type=payload.leg_type, scheduled_at=payload.scheduled_at, source=payload.source,
        vehicle_id=payload.vehicle_id, vendor_id=payload.vendor_id, vendor_vehicle_type=payload.vendor_vehicle_type,
        usage_type=payload.usage_type, destination_notes=payload.destination_notes,
        rate_basis=payload.rate_basis if show_cost else None, amount=payload.amount if show_cost else None,
        currency=payload.currency, lkr_equivalent=payload.lkr_equivalent if show_cost else None,
        created_by=current_user.id, **owner,
    )
    db.add(leg)
    db.commit()
    db.refresh(leg)

    who = "in-house vehicle" if leg.source == TransportSource.INHOUSE else "vendor"
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id, action="LEG_ADDED", description=f"{leg.leg_type.value} assigned — {who}", new_value=leg.scheduled_at.isoformat())
    if payload.source == TransportSource.INHOUSE and payload.override:
        record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id, action="LEG_VEHICLE_CONFLICT_OVERRIDE", description="Vehicle assigned despite a scheduling conflict", reason=payload.override_reason)
    notify_role(db, tenant_id, NotificationRole.TRANSPORT, f"{leg.leg_type.value} assigned: {trip.trip_no}", trip.id)
    return _out(db, leg, show_cost)


@router.post("/legs/{leg_id}/complete")
def complete_leg(leg_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_TRANSPORT_LEGS)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    leg = db.query(TransportLeg).filter(TransportLeg.id == leg_id, TransportLeg.tenant_id == tenant_id).first()
    if not leg:
        raise not_found("Leg not found.")
    if leg.completed_at:
        raise conflict("Already completed.")
    from app.security import now_utc

    leg.completed_by = current_user.id
    leg.completed_at = now_utc()
    db.commit()

    trip = leg.trip_id and db.query(Trip).filter(Trip.id == leg.trip_id).first() or db.query(Trip).filter(Trip.group_id == leg.group_id).first()
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id if trip else None, action="LEG_COMPLETED", description=f"{leg.leg_type.value} completed")
    if leg.leg_type == TransportLegType.DEPARTURE_DROP and trip:
        notify_role(db, tenant_id, NotificationRole.COORDINATOR, f"Departure drop completed — {trip.trip_no} ready to close", trip.id)
    return _out(db, leg, current_user.role in CAN_SEE_TRANSPORT_COST)


class LegCancelIn(BaseModel):
    reason: str
    charge: float = 0


@router.post("/legs/{leg_id}/cancel")
def cancel_leg(leg_id: uuid.UUID, payload: LegCancelIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_CANCEL_TRANSPORT_LEG)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    leg = db.query(TransportLeg).filter(TransportLeg.id == leg_id, TransportLeg.tenant_id == tenant_id).first()
    if not leg:
        raise not_found("Leg not found.")
    if not payload.reason.strip():
        raise bad_request("A reason is required.")
    leg.is_cancelled = True
    leg.is_assigned = False
    leg.cancel_reason = payload.reason
    leg.cancel_charge = payload.charge
    db.commit()
    trip = leg.trip_id and db.query(Trip).filter(Trip.id == leg.trip_id).first() or db.query(Trip).filter(Trip.group_id == leg.group_id).first()
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id if trip else None, action="LEG_CANCELLED", description=f"{leg.leg_type.value} cancelled — charge LKR {payload.charge}", reason=payload.reason)
    return _out(db, leg, current_user.role in CAN_SEE_TRANSPORT_COST)


class LegPayIn(BaseModel):
    status: str
    method: str | None = None
    payment_date: date | None = None


@router.post("/legs/{leg_id}/payment")
def pay_leg(leg_id: uuid.UUID, payload: LegPayIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    leg = db.query(TransportLeg).filter(TransportLeg.id == leg_id, TransportLeg.tenant_id == tenant_id).first()
    if not leg:
        raise not_found("Leg not found.")
    if payload.status in ("Paid", "Partially Paid") and not current_user.can_mark_paid:
        raise forbidden("You do not hold the Mark-Paid permission.")
    if payload.status == "Paid" and not (payload.method and payload.payment_date):
        raise bad_request("Method and date are required when Paid.")
    old = leg.payment_status
    leg.payment_status = PaymentStatus(payload.status)
    leg.payment_method = payload.method
    leg.payment_date = payload.payment_date
    db.commit()
    if old.value != payload.status:
        trip = leg.trip_id and db.query(Trip).filter(Trip.id == leg.trip_id).first() or db.query(Trip).filter(Trip.group_id == leg.group_id).first()
        record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id if trip else None, action="PAYMENT_STATUS", description=f"{leg.leg_type.value} vendor payment changed", old_value=old.value, new_value=payload.status)
    return _out(db, leg, True)
