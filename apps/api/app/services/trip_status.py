"""Trip status transition engine — mirrors the prototype's `ALLOWED_NEXT` /
`tryStatus()` guard rules, enforced server-side (task brief: "Important status
changes must be validated on the backend... Do not permit arbitrary status
changes that bypass required workflow rules.").
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict
from app.models.enums import ALLOWED_STATUS_TRANSITIONS, REASON_REQUIRED_STATUSES, ChecklistItemKey, TripStatus
from app.models.trip import Trip
from app.services.checklist import gate_check, lamp_state


def validate_transition(db: Session, trip: Trip, to_status: TripStatus, reason: str | None) -> None:
    allowed = ALLOWED_STATUS_TRANSITIONS.get(trip.status, [])
    if to_status not in allowed:
        raise conflict(f"Cannot move a trip from {trip.status.value} to {to_status.value}.")

    if to_status == TripStatus.CLEARED and not trip.clearances:
        raise bad_request("Record Cleared-to-Book first.")

    if to_status == TripStatus.COMPLETED:
        state = lamp_state(db, trip, ChecklistItemKey.DROP_COMPLETED)
        if state not in ("green", "na"):
            raise bad_request("Departure Drop must be completed (or marked N/A) first.")

    if to_status == TripStatus.CLOSED:
        blockers = gate_check(db, trip)
        if blockers:
            raise conflict("Trip cannot be closed yet: " + "; ".join(blockers))

    if to_status in REASON_REQUIRED_STATUSES and not (reason and reason.strip()):
        raise bad_request("A reason is required for this status change.")
