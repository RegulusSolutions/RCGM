"""Derived (never manually ticked) completion checklist, mirroring the
prototype's `lampState()` / `gateCheck()` functions.
"""
from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.booking import FlightBooking, HotelBooking, VisaApplication
from app.models.enums import (
    BookingStatus,
    ChecklistItemKey,
    NA_ELIGIBLE_CHECKLIST_ITEMS,
    PackageFlagStatus,
    TransportLegType,
    VisaStatus,
)
from app.models.expense import ExpenseSummary
from app.models.trip import Trip, TripChecklistItem

_OK_VISA_STATES = {VisaStatus.GRANTED, VisaStatus.ON_ARRIVAL, VisaStatus.NOT_REQUIRED}

CHECKLIST_LABELS = {
    ChecklistItemKey.FLIGHT: "Flight booked",
    ChecklistItemKey.HOTEL: "Hotel booked",
    ChecklistItemKey.VISA: "Visa confirmed (per traveller)",
    ChecklistItemKey.PICKUP_ASSIGNED: "Arrival pickup assigned",
    ChecklistItemKey.PICKUP_COMPLETED: "Arrival pickup completed",
    ChecklistItemKey.DROP_ASSIGNED: "Departure drop assigned",
    ChecklistItemKey.DROP_COMPLETED: "Departure drop completed",
    ChecklistItemKey.EXPENSE: "Expense Summary generated",
    ChecklistItemKey.FLAG: "Package Status set",
}


def _owner_filter(model, trip: Trip):
    return or_(model.trip_id == trip.id, model.group_id == trip.group_id if trip.group_id else False)


def bookings_of(db: Session, trip: Trip, model):
    return db.query(model).filter(_owner_filter(model, trip)).all()


def legs_of(db: Session, trip: Trip):
    from app.models.transport import TransportLeg

    return db.query(TransportLeg).filter(_owner_filter(TransportLeg, trip)).all()


def is_expense_stale(db: Session, trip: Trip) -> bool:
    from app.services.expense_service import count_changes_since

    current = (
        db.query(ExpenseSummary)
        .filter(ExpenseSummary.trip_id == trip.id, ExpenseSummary.is_current.is_(True))
        .first()
    )
    if not current:
        return True
    return count_changes_since(db, trip.id, current.generated_at) > 0


def get_na_map(db: Session, trip: Trip) -> dict[ChecklistItemKey, TripChecklistItem]:
    rows = db.query(TripChecklistItem).filter(TripChecklistItem.trip_id == trip.id).all()
    return {row.item_key: row for row in rows if row.is_not_applicable}


def lamp_state(db: Session, trip: Trip, item: ChecklistItemKey, na_map: dict | None = None) -> str:
    if na_map is None:
        na_map = get_na_map(db, trip)
    if item in NA_ELIGIBLE_CHECKLIST_ITEMS and item in na_map:
        return "na"

    if item == ChecklistItemKey.FLIGHT:
        rows = bookings_of(db, trip, FlightBooking)
        ok = any(b.booking_status == BookingStatus.CONFIRMED and b.pnr for b in rows)
    elif item == ChecklistItemKey.HOTEL:
        rows = bookings_of(db, trip, HotelBooking)
        ok = any(b.booking_status == BookingStatus.CONFIRMED and b.confirmation_no for b in rows)
    elif item == ChecklistItemKey.VISA:
        visas = db.query(VisaApplication).filter(VisaApplication.trip_id == trip.id).all()
        ok = bool(visas) and all(v.status in _OK_VISA_STATES for v in visas)
    elif item == ChecklistItemKey.PICKUP_ASSIGNED:
        legs = legs_of(db, trip)
        ok = any(l.leg_type == TransportLegType.ARRIVAL_PICKUP and l.is_assigned and not l.is_cancelled for l in legs)
    elif item == ChecklistItemKey.PICKUP_COMPLETED:
        legs = legs_of(db, trip)
        ok = any(l.leg_type == TransportLegType.ARRIVAL_PICKUP and l.completed_at for l in legs)
    elif item == ChecklistItemKey.DROP_ASSIGNED:
        legs = legs_of(db, trip)
        ok = any(l.leg_type == TransportLegType.DEPARTURE_DROP and l.is_assigned and not l.is_cancelled for l in legs)
    elif item == ChecklistItemKey.DROP_COMPLETED:
        legs = legs_of(db, trip)
        ok = any(l.leg_type == TransportLegType.DEPARTURE_DROP and l.completed_at for l in legs)
    elif item == ChecklistItemKey.EXPENSE:
        ok = not is_expense_stale(db, trip)
    elif item == ChecklistItemKey.FLAG:
        ok = trip.package_flag != PackageFlagStatus.PENDING
    else:
        ok = False
    return "green" if ok else "open"


def full_checklist(db: Session, trip: Trip) -> list[dict]:
    na_map = get_na_map(db, trip)
    out = []
    for item in ChecklistItemKey:
        state = lamp_state(db, trip, item, na_map)
        entry = {"item_key": item.value, "label": CHECKLIST_LABELS[item], "state": state}
        if state == "na" and item in na_map:
            row = na_map[item]
            entry["na_reason"] = row.na_reason
            entry["na_by"] = str(row.na_by) if row.na_by else None
            entry["na_at"] = row.na_at.isoformat() if row.na_at else None
        out.append(entry)
    return out


def gate_check(db: Session, trip: Trip) -> list[str]:
    """Blockers preventing CLOSED transition — mirrors `gateCheck()`."""
    blockers = []
    na_map = get_na_map(db, trip)
    for item in ChecklistItemKey:
        state = lamp_state(db, trip, item, na_map)
        if state in ("green", "na"):
            continue
        if item == ChecklistItemKey.EXPENSE:
            has_any = db.query(ExpenseSummary).filter(ExpenseSummary.trip_id == trip.id).first() is not None
            blockers.append(
                "Expense Summary stale — regenerate before closing" if has_any else "Expense Summary not generated"
            )
        elif item == ChecklistItemKey.FLAG:
            blockers.append("Package Status flag is Pending (Manager view)")
        else:
            blockers.append(f"{CHECKLIST_LABELS[item]} is open")
    return blockers
