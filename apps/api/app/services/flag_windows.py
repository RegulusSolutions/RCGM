"""Time-aware urgency flags for the Open Tasks system — mirrors the
prototype's `anchorFor()` / `flagLevel()` / `openTasks()` functions, plus the
brief's additional required filters (urgency/trip/guest/task type/date
range/department).
"""
from __future__ import annotations

from datetime import datetime, time, timezone

from sqlalchemy.orm import Session

from app.models.booking import BookingStatus, FlightBooking, HotelBooking
from app.models.enums import BookingLevel, ChecklistItemKey, TripStatus
from app.models.tenant import TenantSettings
from app.models.trip import Trip
from app.services.checklist import lamp_state

FLAG_ITEMS = [
    (ChecklistItemKey.FLIGHT, "Flight booking"),
    (ChecklistItemKey.HOTEL, "Hotel booking"),
    (ChecklistItemKey.VISA, "Visa application"),
    (ChecklistItemKey.PICKUP_ASSIGNED, "Arrival pickup assignment"),
    (ChecklistItemKey.DROP_ASSIGNED, "Departure drop assignment"),
]

_TERMINAL_OR_DRAFT = {
    TripStatus.CANCELLED,
    TripStatus.NO_SHOW,
    TripStatus.CLOSED,
    TripStatus.COMPLETED,
    TripStatus.DRAFT,
}


def _confirmed_flight(db: Session, trip: Trip) -> FlightBooking | None:
    q = db.query(FlightBooking).filter(FlightBooking.booking_status == BookingStatus.CONFIRMED)
    if trip.group_id:
        q = q.filter((FlightBooking.trip_id == trip.id) | (FlightBooking.group_id == trip.group_id))
    else:
        q = q.filter(FlightBooking.trip_id == trip.id)
    return q.first()


def _confirmed_hotel(db: Session, trip: Trip) -> HotelBooking | None:
    q = db.query(HotelBooking).filter(HotelBooking.booking_status == BookingStatus.CONFIRMED)
    if trip.group_id:
        q = q.filter((HotelBooking.trip_id == trip.id) | (HotelBooking.group_id == trip.group_id))
    else:
        q = q.filter(HotelBooking.trip_id == trip.id)
    return q.first()


def _anchor_for(db: Session, trip: Trip, item: ChecklistItemKey) -> datetime | None:
    def dt(d, t=time(0, 0)):
        return datetime.combine(d, t, tzinfo=timezone.utc) if d else None

    if item == ChecklistItemKey.FLIGHT:
        return dt(trip.arrival_date)
    if item == ChecklistItemKey.HOTEL:
        hb = _confirmed_hotel(db, trip)
        return dt(hb.check_in if hb else trip.arrival_date, time(14, 0))
    if item == ChecklistItemKey.VISA:
        return dt(trip.arrival_date)
    if item == ChecklistItemKey.PICKUP_ASSIGNED:
        fb = _confirmed_flight(db, trip)
        if fb and fb.arrival_datetime:
            return fb.arrival_datetime.replace(tzinfo=timezone.utc)
        return dt(trip.arrival_date, time(12, 0))
    if item == ChecklistItemKey.DROP_ASSIGNED:
        fb = _confirmed_flight(db, trip)
        if fb and fb.return_datetime:
            return fb.return_datetime.replace(tzinfo=timezone.utc)
        return dt(trip.departure_date, time(12, 0))
    return None


def flag_level(db: Session, trip: Trip, item: ChecklistItemKey, settings: TenantSettings) -> str | None:
    if trip.status in _TERMINAL_OR_DRAFT:
        return None
    if lamp_state(db, trip, item) != "open":
        return None
    anchor = _anchor_for(db, trip, item)
    if not anchor:
        return None
    hours_until = (anchor - datetime.now(timezone.utc)).total_seconds() / 3600

    windows = {
        ChecklistItemKey.FLIGHT: (settings.flight_amber_days * 24, settings.flight_red_hrs),
        ChecklistItemKey.HOTEL: (settings.hotel_amber_days * 24, settings.hotel_red_hrs),
        ChecklistItemKey.VISA: (settings.visa_amber_days * 24, settings.visa_red_hrs),
        ChecklistItemKey.PICKUP_ASSIGNED: (settings.pickup_amber_hrs, settings.pickup_red_hrs),
        ChecklistItemKey.DROP_ASSIGNED: (settings.drop_amber_hrs, settings.drop_red_hrs),
    }
    amber_h, red_h = windows.get(item, (None, None))
    if amber_h is None:
        return None
    if hours_until <= red_h:
        return "red"
    if hours_until <= amber_h:
        return "amber"
    return None


def open_tasks(db: Session, trips: list[Trip], settings: TenantSettings) -> list[dict]:
    out = []
    for trip in trips:
        for item, label in FLAG_ITEMS:
            level = flag_level(db, trip, item, settings)
            if level:
                anchor = _anchor_for(db, trip, item)
                out.append(
                    {
                        "trip_id": str(trip.id),
                        "trip_no": trip.trip_no,
                        "guest_id": str(trip.guest_id),
                        "item_key": item.value,
                        "label": label,
                        "level": level,
                        "anchor": anchor.isoformat() if anchor else None,
                        "trip_status": trip.status.value,
                    }
                )
    out.sort(key=lambda x: (0 if x["level"] == "red" else 1, x["anchor"] or ""))
    return out
