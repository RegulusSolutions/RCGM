"""Reports — every endpoint reads live database rows only (no fabricated
stats, per the task brief). Each report has a JSON endpoint and a `/csv`
sibling that streams the same rows as a downloadable file.
"""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.audit import AuditEvent
from app.models.booking import FlightBooking, HotelBooking, VisaApplication
from app.models.enums import TripStatus, UserRole
from app.models.expense import ExpenseSummary
from app.models.guest import Guest
from app.models.master_data import MarketingAgent
from app.models.tenant import TenantSettings
from app.models.trip import Trip
from app.models.transport import TransportLeg
from app.services.csv_export import rows_to_csv_response
from app.services.flag_windows import open_tasks

router = APIRouter(prefix="/api/reports", tags=["reports"])

READ_ROLES = (UserRole.COORDINATOR, UserRole.TENANT_ADMIN, UserRole.MANAGER)

_TERMINAL = {TripStatus.CANCELLED, TripStatus.NO_SHOW, TripStatus.CLOSED, TripStatus.COMPLETED}


def _base_trip_query(db: Session, tenant_id: uuid.UUID, date_from: date | None, date_to: date | None, status: TripStatus | None, agent_id: uuid.UUID | None, guest_id: uuid.UUID | None, group_id: uuid.UUID | None):
    q = db.query(Trip).filter(Trip.tenant_id == tenant_id)
    if date_from:
        q = q.filter(Trip.arrival_date >= date_from)
    if date_to:
        q = q.filter(Trip.arrival_date <= date_to)
    if status:
        q = q.filter(Trip.status == status)
    if agent_id:
        q = q.filter(Trip.agent_id == agent_id)
    if guest_id:
        q = q.filter(Trip.guest_id == guest_id)
    if group_id:
        q = q.filter(Trip.group_id == group_id)
    return q


def _guest_name(db, guest_id):
    g = db.query(Guest).filter(Guest.id == guest_id).first()
    return g.name if g else None


def _agent_name(db, agent_id):
    if not agent_id:
        return None
    a = db.query(MarketingAgent).filter(MarketingAgent.id == agent_id).first()
    return a.name if a else None


# ------------------------------------------------------- arrivals/departures
def _arrivals_departures_rows(db, tenant_id, **f):
    trips = _base_trip_query(db, tenant_id, **f).order_by(Trip.arrival_date).all()
    return [
        {
            "trip_no": t.trip_no, "guest_name": _guest_name(db, t.guest_id), "status": t.status.value,
            "arrival_date": t.arrival_date.isoformat(), "departure_date": t.departure_date.isoformat(),
            "agent_name": _agent_name(db, t.agent_id),
        }
        for t in trips
    ]


@router.get("/arrivals-departures")
def arrivals_departures(date_from: date | None = None, date_to: date | None = None, status: TripStatus | None = None, agent_id: uuid.UUID | None = None, guest_id: uuid.UUID | None = None, group_id: uuid.UUID | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _arrivals_departures_rows(db, tenant_id, date_from=date_from, date_to=date_to, status=status, agent_id=agent_id, guest_id=guest_id, group_id=group_id)


@router.get("/arrivals-departures/csv")
def arrivals_departures_csv(date_from: date | None = None, date_to: date | None = None, status: TripStatus | None = None, agent_id: uuid.UUID | None = None, guest_id: uuid.UUID | None = None, group_id: uuid.UUID | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_arrivals_departures_rows(db, tenant_id, date_from=date_from, date_to=date_to, status=status, agent_id=agent_id, guest_id=guest_id, group_id=group_id), "arrivals-departures.csv")


# --------------------------------------------------------------- guests visited
def _guests_visited_rows(db, tenant_id, date_from, date_to):
    q = db.query(Trip).filter(Trip.tenant_id == tenant_id, Trip.status.in_([TripStatus.IN_HOUSE, TripStatus.COMPLETED, TripStatus.CLOSED]))
    if date_from:
        q = q.filter(Trip.arrival_date >= date_from)
    if date_to:
        q = q.filter(Trip.arrival_date <= date_to)
    trips = q.all()
    return [
        {"guest_name": _guest_name(db, t.guest_id), "trip_no": t.trip_no, "arrival_date": t.arrival_date.isoformat(), "departure_date": t.departure_date.isoformat(), "status": t.status.value}
        for t in trips
    ]


@router.get("/guests-visited")
def guests_visited(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _guests_visited_rows(db, tenant_id, date_from, date_to)


@router.get("/guests-visited/csv")
def guests_visited_csv(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_guests_visited_rows(db, tenant_id, date_from, date_to), "guests-visited.csv")


# --------------------------------------------------------------- trip expenses
def _expenses_rows(db, tenant_id, date_from, date_to):
    q = db.query(ExpenseSummary).join(Trip, Trip.id == ExpenseSummary.trip_id).filter(ExpenseSummary.tenant_id == tenant_id, ExpenseSummary.is_current.is_(True))
    if date_from:
        q = q.filter(Trip.arrival_date >= date_from)
    if date_to:
        q = q.filter(Trip.arrival_date <= date_to)
    rows = []
    for s in q.all():
        trip = db.query(Trip).filter(Trip.id == s.trip_id).first()
        rows.append(
            {
                "trip_no": trip.trip_no if trip else None, "guest_name": _guest_name(db, trip.guest_id) if trip else None,
                "flight_total_lkr": float(s.flight_total_lkr), "hotel_total_lkr": float(s.hotel_total_lkr),
                "transport_total_lkr": float(s.transport_total_lkr), "visa_total_lkr": float(s.visa_total_lkr),
                "grand_total_lkr": float(s.grand_total_lkr), "outstanding_total_lkr": float(s.outstanding_total_lkr),
                "generated_at": s.generated_at.isoformat(),
            }
        )
    return rows


@router.get("/trip-expenses")
def trip_expenses(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _expenses_rows(db, tenant_id, date_from, date_to)


@router.get("/trip-expenses/csv")
def trip_expenses_csv(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_expenses_rows(db, tenant_id, date_from, date_to), "trip-expenses.csv")


# --------------------------------------------------------------- payment status
def _payment_status_rows(db, tenant_id, payment_status: str | None):
    rows = []
    for b in db.query(FlightBooking).filter(FlightBooking.tenant_id == tenant_id).all():
        if payment_status and b.payment_status.value != payment_status:
            continue
        rows.append({"type": "Flight", "booking_no": b.booking_no, "amount": float(b.amount or 0), "currency": b.currency, "lkr_equivalent": float(b.lkr_equivalent or 0), "payment_status": b.payment_status.value})
    for b in db.query(HotelBooking).filter(HotelBooking.tenant_id == tenant_id).all():
        if payment_status and b.payment_status.value != payment_status:
            continue
        rows.append({"type": "Hotel", "booking_no": b.booking_no, "amount": float(b.amount or 0), "currency": b.currency, "lkr_equivalent": float(b.lkr_equivalent or 0), "payment_status": b.payment_status.value})
    for l in db.query(TransportLeg).filter(TransportLeg.tenant_id == tenant_id, TransportLeg.vendor_id.isnot(None)).all():
        if payment_status and l.payment_status.value != payment_status:
            continue
        rows.append({"type": "Transport (vendor)", "booking_no": str(l.id), "amount": float(l.amount or 0), "currency": l.currency, "lkr_equivalent": float(l.lkr_equivalent or 0), "payment_status": l.payment_status.value})
    for v in db.query(VisaApplication).filter(VisaApplication.tenant_id == tenant_id).all():
        if payment_status and v.payment_status.value != payment_status:
            continue
        rows.append({"type": "Visa", "booking_no": v.traveller_name, "amount": float(v.fee_usd or 0), "currency": "USD", "lkr_equivalent": float(v.lkr_equivalent or 0), "payment_status": v.payment_status.value})
    return rows


@router.get("/payment-status")
def payment_status_report(payment_status: str | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _payment_status_rows(db, tenant_id, payment_status)


@router.get("/payment-status/csv")
def payment_status_csv(payment_status: str | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_payment_status_rows(db, tenant_id, payment_status), "payment-status.csv")


# --------------------------------------------------------------- agent performance
def _agent_performance_rows(db, tenant_id, date_from, date_to):
    agents = db.query(MarketingAgent).filter(MarketingAgent.tenant_id == tenant_id).all()
    rows = []
    for a in agents:
        q = db.query(Trip).filter(Trip.tenant_id == tenant_id, Trip.agent_id == a.id)
        if date_from:
            q = q.filter(Trip.arrival_date >= date_from)
        if date_to:
            q = q.filter(Trip.arrival_date <= date_to)
        trips = q.all()
        total = len(trips)
        completed = len([t for t in trips if t.status in (TripStatus.COMPLETED, TripStatus.CLOSED)])
        cancelled = len([t for t in trips if t.status == TripStatus.CANCELLED])
        no_show = len([t for t in trips if t.status == TripStatus.NO_SHOW])
        rows.append({"agent_name": a.name, "market": a.market, "total_trips": total, "completed": completed, "cancelled": cancelled, "no_show": no_show})
    return rows


@router.get("/agent-performance")
def agent_performance(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _agent_performance_rows(db, tenant_id, date_from, date_to)


@router.get("/agent-performance/csv")
def agent_performance_csv(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_agent_performance_rows(db, tenant_id, date_from, date_to), "agent-performance.csv")


# --------------------------------------------------------------- cancellations / no-shows
def _status_rows(db, tenant_id, status: TripStatus, date_from, date_to):
    q = db.query(Trip).filter(Trip.tenant_id == tenant_id, Trip.status == status)
    if date_from:
        q = q.filter(Trip.arrival_date >= date_from)
    if date_to:
        q = q.filter(Trip.arrival_date <= date_to)
    return [
        {"trip_no": t.trip_no, "guest_name": _guest_name(db, t.guest_id), "arrival_date": t.arrival_date.isoformat(), "reason": t.cancel_reason, "agent_name": _agent_name(db, t.agent_id)}
        for t in q.all()
    ]


@router.get("/cancellations")
def cancellations(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _status_rows(db, tenant_id, TripStatus.CANCELLED, date_from, date_to)


@router.get("/cancellations/csv")
def cancellations_csv(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_status_rows(db, tenant_id, TripStatus.CANCELLED, date_from, date_to), "cancellations.csv")


@router.get("/no-shows")
def no_shows(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _status_rows(db, tenant_id, TripStatus.NO_SHOW, date_from, date_to)


@router.get("/no-shows/csv")
def no_shows_csv(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_status_rows(db, tenant_id, TripStatus.NO_SHOW, date_from, date_to), "no-shows.csv")


# --------------------------------------------------------------- audit report
def _audit_rows(db, tenant_id, date_from, date_to):
    q = db.query(AuditEvent).filter(AuditEvent.tenant_id == tenant_id)
    if date_from:
        q = q.filter(AuditEvent.created_at >= date_from)
    if date_to:
        q = q.filter(AuditEvent.created_at <= date_to)
    return [
        {"created_at": e.created_at.isoformat(), "username": e.username, "role": e.role, "action": e.action, "description": e.description, "old_value": e.old_value, "new_value": e.new_value, "reason": e.reason}
        for e in q.order_by(AuditEvent.created_at.desc()).limit(2000).all()
    ]


@router.get("/audit")
def audit_report(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _audit_rows(db, tenant_id, date_from, date_to)


@router.get("/audit/csv")
def audit_report_csv(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_audit_rows(db, tenant_id, date_from, date_to), "audit-report.csv")


# --------------------------------------------------------------- active trips
def _active_trips_rows(db, tenant_id):
    trips = db.query(Trip).filter(Trip.tenant_id == tenant_id, Trip.status.notin_(_TERMINAL)).all()
    return [
        {"trip_no": t.trip_no, "guest_name": _guest_name(db, t.guest_id), "status": t.status.value, "arrival_date": t.arrival_date.isoformat(), "departure_date": t.departure_date.isoformat()}
        for t in trips
    ]


@router.get("/active-trips")
def active_trips(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _active_trips_rows(db, tenant_id)


@router.get("/active-trips/csv")
def active_trips_csv(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_active_trips_rows(db, tenant_id), "active-trips.csv")


# --------------------------------------------------------------- open tasks
def _open_tasks_rows(db, tenant_id):
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    trips = db.query(Trip).filter(Trip.tenant_id == tenant_id).all()
    tasks = open_tasks(db, trips, settings)
    for t in tasks:
        t["guest_name"] = _guest_name(db, uuid.UUID(t["guest_id"]))
    return tasks


@router.get("/open-tasks")
def open_tasks_report(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return _open_tasks_rows(db, tenant_id)


@router.get("/open-tasks/csv")
def open_tasks_report_csv(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    return rows_to_csv_response(_open_tasks_rows(db, tenant_id), "open-tasks.csv")
