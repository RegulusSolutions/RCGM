"""F&B / Host — a strictly read-only view. This module must never surface
costs, payment information, private documents, or audit/compliance details;
only the explicit hosting-relevant fields named in the brief.
"""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.booking import BookingStatus, HotelBooking
from app.models.enums import TripStatus, UserRole
from app.models.guest import Guest
from app.models.trip import Trip

router = APIRouter(prefix="/api/host", tags=["host"])

_VISIBLE_STATUSES = (TripStatus.TRAVEL_CONFIRMED, TripStatus.IN_HOUSE)


@router.get("/arrivals")
def host_arrivals(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.FNB_VIEW, UserRole.COORDINATOR, UserRole.TENANT_ADMIN)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    q = db.query(Trip).filter(Trip.tenant_id == tenant_id, Trip.status.in_(_VISIBLE_STATUSES))
    if date_from:
        q = q.filter(Trip.arrival_date >= date_from)
    if date_to:
        q = q.filter(Trip.arrival_date <= date_to)

    out = []
    for trip in q.order_by(Trip.arrival_date).all():
        guest = db.query(Guest).filter(Guest.id == trip.guest_id).first()
        if not guest:
            continue
        hotel = (
            db.query(HotelBooking)
            .filter(
                or_(HotelBooking.trip_id == trip.id, HotelBooking.group_id == trip.group_id if trip.group_id else False),
                HotelBooking.booking_status == BookingStatus.CONFIRMED,
            )
            .first()
        )
        prefs = guest.preferences
        out.append(
            {
                "trip_id": str(trip.id), "guest_name": guest.name, "arrival_date": trip.arrival_date.isoformat(),
                "departure_date": trip.departure_date.isoformat(), "hotel_name": hotel.hotel_name if hotel else None,
                "dietary": prefs.dietary if prefs else None, "beverage": prefs.beverage if prefs else None,
                "room": prefs.room if prefs else None, "language": prefs.language if prefs else None,
                "vip_level": prefs.vip_level if prefs else None, "signboard_name": prefs.signboard_name if prefs else None,
                "hosting_notes": prefs.notes if prefs else None,
            }
        )
    return out
