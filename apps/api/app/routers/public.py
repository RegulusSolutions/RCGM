"""Unauthenticated guest itinerary page. Only ever exposes the explicit allow-
list of fields named in the brief — costs, payments, passport numbers, DOB,
internal notes, compliance info, audit history and private documents must
NEVER appear in this module.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.database import get_db
from app.deps import get_client_ip
from app.models.booking import BookingStatus, FlightBooking, HotelBooking
from app.models.enums import TransportLegType
from app.models.guest import Guest
from app.models.guest_link import GuestLinkAccessLog, GuestShareLink
from app.models.master_data import Driver, Vehicle
from app.models.trip import Trip
from app.models.transport import TransportLeg
from app.security import hash_token, now_utc

router = APIRouter(prefix="/api/public/trips", tags=["public"])


@router.get("/{token}")
def get_public_itinerary(token: str, request: Request, db: Session = Depends(get_db)):
    link = db.query(GuestShareLink).filter(GuestShareLink.token_hash == hash_token(token)).first()
    if not link:
        raise not_found("This link is invalid.")
    if link.revoked_at is not None:
        raise not_found("This link has been revoked.")
    if link.expires_at and link.expires_at < now_utc():
        raise not_found("This link has expired.")

    trip = db.query(Trip).filter(Trip.id == link.trip_id).first()
    if not trip:
        raise not_found("Trip not found.")
    guest = db.query(Guest).filter(Guest.id == trip.guest_id).first()

    link.access_count += 1
    link.last_accessed_at = now_utc()
    db.add(GuestLinkAccessLog(link_id=link.id, accessed_at=now_utc(), ip_address=get_client_ip(request), user_agent=request.headers.get("user-agent")))
    db.commit()

    def _owner_filter(model):
        from sqlalchemy import or_

        return or_(model.trip_id == trip.id, model.group_id == trip.group_id if trip.group_id else False)

    flight = db.query(FlightBooking).filter(_owner_filter(FlightBooking), FlightBooking.booking_status == BookingStatus.CONFIRMED).first()
    hotel = db.query(HotelBooking).filter(_owner_filter(HotelBooking), HotelBooking.booking_status == BookingStatus.CONFIRMED).first()
    pickup = db.query(TransportLeg).filter(_owner_filter(TransportLeg), TransportLeg.leg_type == TransportLegType.ARRIVAL_PICKUP, TransportLeg.is_cancelled.is_(False)).first()
    drop = db.query(TransportLeg).filter(_owner_filter(TransportLeg), TransportLeg.leg_type == TransportLegType.DEPARTURE_DROP, TransportLeg.is_cancelled.is_(False)).first()

    def _driver_info(leg: TransportLeg | None):
        if not leg or not leg.vehicle_id:
            return None
        vehicle = db.query(Vehicle).filter(Vehicle.id == leg.vehicle_id).first()
        driver = db.query(Driver).filter(Driver.id == vehicle.driver_id).first() if vehicle and vehicle.driver_id else None
        return {
            "vehicle_no": vehicle.vehicle_no if vehicle else None,
            "vehicle_type": vehicle.vehicle_type if vehicle else None,
            "driver_name": driver.name if driver else None,
            "driver_mobile": driver.mobile if driver else None,
        } if vehicle else None

    return {
        "guest_name": guest.name if guest else None,
        "arrival_date": trip.arrival_date.isoformat(),
        "departure_date": trip.departure_date.isoformat(),
        "flight": {
            "airline_name": flight.airline_name, "flight_numbers": flight.flight_numbers,
            "arrival_datetime": flight.arrival_datetime.isoformat() if flight.arrival_datetime else None,
            "return_datetime": flight.return_datetime.isoformat() if flight.return_datetime else None,
        } if flight else None,
        "hotel": {
            "hotel_name": hotel.hotel_name, "room_type": hotel.room_type,
            "check_in": hotel.check_in.isoformat(), "check_out": hotel.check_out.isoformat(),
        } if hotel else None,
        "pickup": {"scheduled_at": pickup.scheduled_at.isoformat(), "driver": _driver_info(pickup)} if pickup else None,
        "drop": {"scheduled_at": drop.scheduled_at.isoformat(), "driver": _driver_info(drop)} if drop else None,
        "itinerary_notes": trip.notes,
    }
