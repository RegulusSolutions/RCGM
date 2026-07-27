"""Flight & hotel booking lanes (Coordinator/Reservations only, locked until
the trip has a recorded clearance) — mirrors feature-inventory.md §7.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, forbidden, not_found
from app.core.permissions import CAN_EDIT_BOOKING_LANES
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.booking import BookingStatus, FlightBooking, HotelBooking, PaymentStatus
from app.models.enums import BookingLevel, NotificationRole, UserRole
from app.models.trip import Trip, TripClearance
from app.services.audit import record_event
from app.services.notifications import notify_role
from app.services.trip_numbering import next_booking_no

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _trip_and_clearance(db: Session, trip_id: uuid.UUID, tenant_id: uuid.UUID) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    if not db.query(TripClearance).filter(TripClearance.trip_id == trip.id).first():
        raise forbidden("Booking lanes are locked until Cleared-to-Book is recorded.")
    return trip


def _owner(payload_level: str, trip: Trip):
    if payload_level == "group" and trip.group_id:
        return {"trip_id": None, "group_id": trip.group_id, "level": BookingLevel.GROUP}
    return {"trip_id": trip.id, "group_id": None, "level": BookingLevel.GUEST}


def _check_paid(status_value: str, current_user: CurrentUser):
    if status_value in ("Paid", "Partially Paid") and not current_user.can_mark_paid:
        raise forbidden("You do not hold the Mark-Paid permission.")


# ------------------------------------------------------------------ flight
class FlightIn(BaseModel):
    trip_id: uuid.UUID
    level: str = "guest"
    airline_name: str
    travel_class: str
    flight_numbers: str
    pnr: str | None = None
    route: str | None = None
    ticket_count: int = 1
    arrival_datetime: datetime | None = None
    return_datetime: datetime | None = None
    currency: str = "LKR"
    amount: float | None = None
    lkr_equivalent: float | None = None


def _flight_out(b: FlightBooking) -> dict:
    return {
        "id": str(b.id), "booking_no": b.booking_no, "level": b.level.value, "airline_name": b.airline_name,
        "travel_class": b.travel_class, "flight_numbers": b.flight_numbers, "pnr": b.pnr, "route": b.route,
        "ticket_count": b.ticket_count, "currency": b.currency, "amount": float(b.amount) if b.amount is not None else None,
        "lkr_equivalent": float(b.lkr_equivalent) if b.lkr_equivalent is not None else None,
        "payment_status": b.payment_status.value, "booking_status": b.booking_status.value,
        "cancellation_charge": float(b.cancellation_charge) if b.cancellation_charge is not None else None,
        "cancellation_reason": b.cancellation_reason,
    }


@router.get("/flights")
def list_flights(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR, UserRole.RESERVATIONS, UserRole.TENANT_ADMIN, UserRole.MANAGER)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    q = db.query(FlightBooking).filter(FlightBooking.tenant_id == tenant_id)
    q = q.filter((FlightBooking.trip_id == trip.id) | (FlightBooking.group_id == trip.group_id if trip.group_id else False))
    return [_flight_out(b) for b in q.all()]


@router.post("/flights")
def create_flight(payload: FlightIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = _trip_and_clearance(db, payload.trip_id, tenant_id)
    if payload.amount is None or payload.lkr_equivalent is None:
        raise bad_request("Amount and LKR equivalent are required.")
    owner = _owner(payload.level, trip)
    booking = FlightBooking(
        tenant_id=tenant_id, booking_no=next_booking_no(db, tenant_id), airline_name=payload.airline_name,
        travel_class=payload.travel_class, flight_numbers=payload.flight_numbers, pnr=payload.pnr, route=payload.route,
        ticket_count=payload.ticket_count, arrival_datetime=payload.arrival_datetime, return_datetime=payload.return_datetime,
        currency=payload.currency, amount=payload.amount, lkr_equivalent=payload.lkr_equivalent, created_by=current_user.id,
        **owner,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id, action="BOOKING_ADDED", description=f"Flight booking {booking.booking_no} added", new_value="Draft")
    return _flight_out(booking)


@router.post("/flights/{booking_id}/confirm")
def confirm_flight(booking_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    b = db.query(FlightBooking).filter(FlightBooking.id == booking_id, FlightBooking.tenant_id == tenant_id).first()
    if not b:
        raise not_found("Booking not found.")
    if not b.pnr:
        raise bad_request("PNR is required to confirm a flight.")
    old = b.booking_status
    b.booking_status = BookingStatus.CONFIRMED
    db.commit()
    trip_id = b.trip_id or db.query(Trip).filter(Trip.group_id == b.group_id).first().id
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip_id, action="BOOKING_CONFIRMED", description=f"{b.booking_no} confirmed", old_value=old.value, new_value="Confirmed")
    notify_role(db, tenant_id, NotificationRole.COORDINATOR, f"Flight confirmed: {b.booking_no}", trip_id)
    return _flight_out(b)


class CancelIn(BaseModel):
    charge: float = 0
    charge_lkr: float = 0
    reason: str


@router.post("/flights/{booking_id}/cancel")
def cancel_flight(booking_id: uuid.UUID, payload: CancelIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    b = db.query(FlightBooking).filter(FlightBooking.id == booking_id, FlightBooking.tenant_id == tenant_id).first()
    if not b:
        raise not_found("Booking not found.")
    if not payload.reason.strip():
        raise bad_request("A reason is required.")
    old = b.booking_status
    b.booking_status = BookingStatus.CANCELLED
    b.cancellation_charge = payload.charge
    b.cancellation_charge_lkr = payload.charge_lkr
    b.cancellation_reason = payload.reason
    db.commit()
    trip_id = b.trip_id or db.query(Trip).filter(Trip.group_id == b.group_id).first().id
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip_id, action="BOOKING_CANCELLED", description=f"{b.booking_no} cancelled — charge {b.currency} {payload.charge}", old_value=old.value, new_value="Cancelled", reason=payload.reason)
    return _flight_out(b)


class PaymentIn(BaseModel):
    status: str
    method: str | None = None
    payment_date: date | None = None


@router.post("/flights/{booking_id}/payment")
def pay_flight(booking_id: uuid.UUID, payload: PaymentIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    b = db.query(FlightBooking).filter(FlightBooking.id == booking_id, FlightBooking.tenant_id == tenant_id).first()
    if not b:
        raise not_found("Booking not found.")
    _check_paid(payload.status, current_user)
    if payload.status == "Paid" and not (payload.method and payload.payment_date):
        raise bad_request("Method and date are required when Paid.")
    old = b.payment_status
    b.payment_status = PaymentStatus(payload.status)
    b.payment_method = payload.method
    b.payment_date = payload.payment_date
    db.commit()
    trip_id = b.trip_id or db.query(Trip).filter(Trip.group_id == b.group_id).first().id
    if old.value != payload.status:
        record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip_id, action="PAYMENT_STATUS", description=f"{b.booking_no} payment status changed", old_value=old.value, new_value=payload.status)
    return _flight_out(b)


# ------------------------------------------------------------------- hotel
class HotelIn(BaseModel):
    trip_id: uuid.UUID
    level: str = "guest"
    hotel_name: str
    room_type: str
    room_count: int = 1
    night_count: int = 1
    check_in: date
    check_out: date
    confirmation_no: str | None = None
    meal_plan: str | None = None
    rate_per_night: float | None = None
    currency: str = "LKR"
    amount: float | None = None
    lkr_equivalent: float | None = None


def _hotel_out(b: HotelBooking) -> dict:
    return {
        "id": str(b.id), "booking_no": b.booking_no, "level": b.level.value, "hotel_name": b.hotel_name,
        "room_type": b.room_type, "room_count": b.room_count, "night_count": b.night_count,
        "check_in": b.check_in.isoformat(), "check_out": b.check_out.isoformat(), "confirmation_no": b.confirmation_no,
        "meal_plan": b.meal_plan, "currency": b.currency, "amount": float(b.amount) if b.amount is not None else None,
        "lkr_equivalent": float(b.lkr_equivalent) if b.lkr_equivalent is not None else None,
        "payment_status": b.payment_status.value, "booking_status": b.booking_status.value,
        "cancellation_charge": float(b.cancellation_charge) if b.cancellation_charge is not None else None,
        "cancellation_reason": b.cancellation_reason,
    }


@router.get("/hotels")
def list_hotels_bookings(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR, UserRole.RESERVATIONS, UserRole.TENANT_ADMIN, UserRole.MANAGER)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    q = db.query(HotelBooking).filter(HotelBooking.tenant_id == tenant_id)
    q = q.filter((HotelBooking.trip_id == trip.id) | (HotelBooking.group_id == trip.group_id if trip.group_id else False))
    return [_hotel_out(b) for b in q.all()]


@router.post("/hotels")
def create_hotel(payload: HotelIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = _trip_and_clearance(db, payload.trip_id, tenant_id)
    if payload.check_out <= payload.check_in:
        raise bad_request("Check-out must be after check-in.")
    amount = payload.amount if payload.amount is not None else (payload.rate_per_night or 0) * payload.night_count * payload.room_count
    if payload.lkr_equivalent is None:
        raise bad_request("LKR equivalent is required.")
    owner = _owner(payload.level, trip)
    booking = HotelBooking(
        tenant_id=tenant_id, booking_no=next_booking_no(db, tenant_id), hotel_name=payload.hotel_name,
        room_type=payload.room_type, room_count=payload.room_count, night_count=payload.night_count,
        check_in=payload.check_in, check_out=payload.check_out, confirmation_no=payload.confirmation_no,
        meal_plan=payload.meal_plan, rate_per_night=payload.rate_per_night, currency=payload.currency,
        amount=amount, lkr_equivalent=payload.lkr_equivalent, created_by=current_user.id, **owner,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id, action="BOOKING_ADDED", description=f"Hotel booking {booking.booking_no} added", new_value="Draft")
    return _hotel_out(booking)


@router.post("/hotels/{booking_id}/confirm")
def confirm_hotel(booking_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    b = db.query(HotelBooking).filter(HotelBooking.id == booking_id, HotelBooking.tenant_id == tenant_id).first()
    if not b:
        raise not_found("Booking not found.")
    if not b.confirmation_no:
        raise bad_request("Confirmation number is required to confirm a hotel booking.")
    old = b.booking_status
    b.booking_status = BookingStatus.CONFIRMED
    db.commit()
    trip_id = b.trip_id or db.query(Trip).filter(Trip.group_id == b.group_id).first().id
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip_id, action="BOOKING_CONFIRMED", description=f"{b.booking_no} confirmed", old_value=old.value, new_value="Confirmed")
    notify_role(db, tenant_id, NotificationRole.COORDINATOR, f"Hotel confirmed: {b.booking_no}", trip_id)
    return _hotel_out(b)


@router.post("/hotels/{booking_id}/cancel")
def cancel_hotel(booking_id: uuid.UUID, payload: CancelIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    b = db.query(HotelBooking).filter(HotelBooking.id == booking_id, HotelBooking.tenant_id == tenant_id).first()
    if not b:
        raise not_found("Booking not found.")
    if not payload.reason.strip():
        raise bad_request("A reason is required.")
    old = b.booking_status
    b.booking_status = BookingStatus.CANCELLED
    b.cancellation_charge = payload.charge
    b.cancellation_charge_lkr = payload.charge_lkr
    b.cancellation_reason = payload.reason
    db.commit()
    trip_id = b.trip_id or db.query(Trip).filter(Trip.group_id == b.group_id).first().id
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip_id, action="BOOKING_CANCELLED", description=f"{b.booking_no} cancelled — charge {b.currency} {payload.charge}", old_value=old.value, new_value="Cancelled", reason=payload.reason)
    return _hotel_out(b)


@router.post("/hotels/{booking_id}/payment")
def pay_hotel(booking_id: uuid.UUID, payload: PaymentIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_BOOKING_LANES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    b = db.query(HotelBooking).filter(HotelBooking.id == booking_id, HotelBooking.tenant_id == tenant_id).first()
    if not b:
        raise not_found("Booking not found.")
    _check_paid(payload.status, current_user)
    if payload.status == "Paid" and not (payload.method and payload.payment_date):
        raise bad_request("Method and date are required when Paid.")
    old = b.payment_status
    b.payment_status = PaymentStatus(payload.status)
    b.payment_method = payload.method
    b.payment_date = payload.payment_date
    db.commit()
    trip_id = b.trip_id or db.query(Trip).filter(Trip.group_id == b.group_id).first().id
    if old.value != payload.status:
        record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip_id, action="PAYMENT_STATUS", description=f"{b.booking_no} payment status changed", old_value=old.value, new_value=payload.status)
    return _hotel_out(b)
