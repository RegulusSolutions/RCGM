"""Vehicle double-booking conflict detection.

This is a required enhancement over the prototype (see feature-inventory.md §9,
which documents that the original HTML never checked for overlapping vehicle
assignments despite scheduling vehicles against timed legs). A conflict is any
other non-cancelled leg on the same vehicle whose scheduled window overlaps.
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models.transport import TransportLeg

DEFAULT_LEG_DURATION_HOURS = 3


def find_conflicts(
    db: Session,
    vehicle_id: uuid.UUID,
    scheduled_at,
    exclude_leg_id: uuid.UUID | None = None,
    duration_hours: int = DEFAULT_LEG_DURATION_HOURS,
) -> list[TransportLeg]:
    window_start = scheduled_at - timedelta(hours=duration_hours)
    window_end = scheduled_at + timedelta(hours=duration_hours)
    q = db.query(TransportLeg).filter(
        TransportLeg.vehicle_id == vehicle_id,
        TransportLeg.is_cancelled.is_(False),
        TransportLeg.scheduled_at > window_start,
        TransportLeg.scheduled_at < window_end,
    )
    if exclude_leg_id:
        q = q.filter(TransportLeg.id != exclude_leg_id)
    return q.all()
