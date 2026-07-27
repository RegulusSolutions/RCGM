"""Open Tasks board — dynamically computed from trip dates + tenant flag
windows (never manually maintained), plus the two state-based task types the
brief calls out that flag_windows.py's date-anchored items don't cover:
"Expense summary stale" and "Handover awaiting acknowledgement".
"""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import TripStatus, UserRole
from app.models.guest import Guest
from app.models.tenant import TenantSettings
from app.models.trip import Trip, TripHandover
from app.services.checklist import is_expense_stale
from app.services.flag_windows import open_tasks

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

ALL_STAFF_ROLES = (
    UserRole.TENANT_ADMIN,
    UserRole.COORDINATOR,
    UserRole.RESERVATIONS,
    UserRole.TRANSPORT,
    UserRole.MANAGER,
)

_DEPARTMENT_FOR_ITEM = {
    "flight": "Reservations",
    "hotel": "Reservations",
    "visa": "Reservations",
    "pickup_assigned": "Transport",
    "drop_assigned": "Transport",
    "expense_stale": "Coordinator",
    "handover_pending": "Coordinator",
}


@router.get("")
def list_tasks(
    urgency: str | None = Query(None, description="red|amber"),
    trip_id: uuid.UUID | None = None,
    guest_id: uuid.UUID | None = None,
    task_type: str | None = None,
    department: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*ALL_STAFF_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    trips_q = db.query(Trip).filter(Trip.tenant_id == tenant_id)
    if trip_id:
        trips_q = trips_q.filter(Trip.id == trip_id)
    trips = trips_q.all()

    tasks = open_tasks(db, trips, settings)

    # Restrict to only genuinely relevant items per department, mirroring nav rules.
    if current_user.role == UserRole.RESERVATIONS:
        tasks = [t for t in tasks if t["item_key"] in ("flight", "hotel", "visa")]
    elif current_user.role == UserRole.TRANSPORT:
        tasks = [t for t in tasks if t["item_key"] in ("pickup_assigned", "drop_assigned")]

    # -- Expense-summary-stale tasks
    if current_user.role in (UserRole.COORDINATOR, UserRole.TENANT_ADMIN, UserRole.MANAGER):
        for trip in trips:
            if trip.status in (TripStatus.CANCELLED, TripStatus.NO_SHOW, TripStatus.DRAFT):
                continue
            if is_expense_stale(db, trip):
                tasks.append(
                    {
                        "trip_id": str(trip.id), "trip_no": trip.trip_no, "guest_id": str(trip.guest_id),
                        "item_key": "expense_stale", "label": "Expense summary stale — regenerate",
                        "level": "amber", "anchor": None, "trip_status": trip.status.value,
                    }
                )

        # -- Handover awaiting acknowledgement
        pending = (
            db.query(TripHandover)
            .join(Trip, Trip.id == TripHandover.trip_id)
            .filter(Trip.tenant_id == tenant_id, TripHandover.superseded_at.is_(None), TripHandover.acknowledged_at.is_(None))
            .all()
        )
        for h in pending:
            trip = db.query(Trip).filter(Trip.id == h.trip_id).first()
            if not trip:
                continue
            tasks.append(
                {
                    "trip_id": str(trip.id), "trip_no": trip.trip_no, "guest_id": str(trip.guest_id),
                    "item_key": "handover_pending", "label": "Handover awaiting acknowledgement",
                    "level": "amber", "anchor": h.created_at.isoformat(), "trip_status": trip.status.value,
                }
            )

    if urgency:
        tasks = [t for t in tasks if t["level"] == urgency]
    if guest_id:
        tasks = [t for t in tasks if t["guest_id"] == str(guest_id)]
    if task_type:
        tasks = [t for t in tasks if t["item_key"] == task_type]
    if department:
        tasks = [t for t in tasks if _DEPARTMENT_FOR_ITEM.get(t["item_key"]) == department]
    if date_from or date_to:
        def in_range(t):
            if not t["anchor"]:
                return True
            d = t["anchor"][:10]
            if date_from and d < date_from.isoformat():
                return False
            if date_to and d > date_to.isoformat():
                return False
            return True
        tasks = [t for t in tasks if in_range(t)]

    for t in tasks:
        t["department"] = _DEPARTMENT_FOR_ITEM.get(t["item_key"])

    guest_names = {str(g.id): g.name for g in db.query(Guest).filter(Guest.tenant_id == tenant_id).all()}
    for t in tasks:
        t["guest_name"] = guest_names.get(t["guest_id"])

    tasks.sort(key=lambda x: (0 if x["level"] == "red" else 1, x["anchor"] or ""))
    return {"items": tasks, "total": len(tasks)}
