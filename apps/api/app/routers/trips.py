"""Trip lifecycle: draft/submit, status transitions, clearance, notes,
handover, checklist N/A, companions, guest-link management, detail/list.

Business rules are delegated to app.services (trip_status, checklist,
trip_numbering) — this router only orchestrates validate -> call service ->
persist -> audit -> notify -> respond, per docs/architecture.md.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.permissions import CAN_RECORD_CLEARANCE
from app.database import get_db
from app.deps import CurrentUser, get_client_ip, get_tenant_scope, require_role, require_tenant_user
from app.models.enums import (
    ALLOWED_STATUS_TRANSITIONS,
    ChecklistItemKey,
    NA_ELIGIBLE_CHECKLIST_ITEMS,
    NoteType,
    NotificationRole,
    TripStatus,
    UserRole,
)
from app.models.guest import Guest, GuestPreference
from app.models.master_data import MarketingAgent, Package
from app.models.tenant import Tenant
from app.models.trip import Companion, Trip, TripChecklistItem, TripClearance, TripHandover, TripNote
from app.schemas.common import Page, paginate_query
from app.security import now_utc
from app.services.audit import record_event
from app.services.checklist import full_checklist
from app.services.notifications import notify_role
from app.services.trip_numbering import next_trip_no
from app.services.trip_status import validate_transition

router = APIRouter(prefix="/api/trips", tags=["trips"])

ALL_STAFF_ROLES = (
    UserRole.TENANT_ADMIN,
    UserRole.MARKETING,
    UserRole.COORDINATOR,
    UserRole.RESERVATIONS,
    UserRole.TRANSPORT,
    UserRole.MANAGER,
)


# ---------------------------------------------------------------- schemas ---
class PreferencesIn(BaseModel):
    dietary: str | None = None
    beverage: str | None = None
    room: str | None = None
    language: str | None = None
    vip_level: str | None = None
    signboard_name: str | None = None
    notes: str | None = None


class GuestIn(BaseModel):
    name: str
    membership_no: str
    nationality: str | None = None
    mobile: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    passport_no: str | None = None
    passport_expiry: date | None = None
    dob: date | None = None
    visa_status: str | None = None
    preferences: PreferencesIn = Field(default_factory=PreferencesIn)


class CompanionIn(BaseModel):
    name: str
    relationship: str | None = None
    passport_no: str | None = None
    passport_expiry: date | None = None
    dob: date | None = None
    nationality: str | None = None
    visa_status: str | None = None


class TripRequestIn(BaseModel):
    guest: GuestIn
    companions: list[CompanionIn] = Field(default_factory=list)
    arrival_date: date
    departure_date: date
    package_id: uuid.UUID | None = None
    notes: str | None = None


def _validate_dates(arrival: date, departure: date):
    if departure < arrival:
        raise bad_request("Departure cannot be before arrival.")


def _upsert_guest(db: Session, tenant_id: uuid.UUID, payload: GuestIn) -> Guest:
    guest = None
    if payload.membership_no.strip().upper() != "NEW":
        guest = (
            db.query(Guest)
            .filter(Guest.tenant_id == tenant_id, Guest.membership_no.ilike(payload.membership_no.strip()))
            .first()
        )
    if guest:
        for f in ("name", "nationality", "mobile", "whatsapp", "email", "passport_no", "passport_expiry", "dob", "visa_status"):
            setattr(guest, f, getattr(payload, f))
    else:
        guest = Guest(
            tenant_id=tenant_id,
            name=payload.name,
            membership_no=payload.membership_no,
            nationality=payload.nationality,
            mobile=payload.mobile,
            whatsapp=payload.whatsapp or payload.mobile,
            email=payload.email,
            passport_no=payload.passport_no,
            passport_expiry=payload.passport_expiry,
            dob=payload.dob,
            visa_status=payload.visa_status,
        )
        db.add(guest)
        db.flush()
    if guest.preferences:
        prefs = guest.preferences
    else:
        prefs = GuestPreference(guest_id=guest.id)
        db.add(prefs)
    for f in ("dietary", "beverage", "room", "language", "vip_level", "signboard_name", "notes"):
        setattr(prefs, f, getattr(payload.preferences, f))
    db.flush()
    return guest


def _visible_trip_query(db: Session, current_user: CurrentUser, tenant_id: uuid.UUID):
    q = db.query(Trip).filter(Trip.tenant_id == tenant_id)
    if current_user.role == UserRole.MARKETING:
        q = q.filter(Trip.agent_id == current_user.agent_id)
    elif current_user.role in (UserRole.RESERVATIONS, UserRole.TRANSPORT):
        # Only trips that have at least one clearance recorded are visible —
        # mirrors the prototype's "locked until Cleared-to-Book" rule.
        cleared_trip_ids = db.query(TripClearance.trip_id).filter(TripClearance.tenant_id == tenant_id)
        q = q.filter(Trip.id.in_(cleared_trip_ids))
    return q


def _trip_or_404(db: Session, trip_id: uuid.UUID, tenant_id: uuid.UUID) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    return trip


def _serialize_trip_summary(db: Session, trip: Trip) -> dict:
    guest = db.query(Guest).filter(Guest.id == trip.guest_id).first()
    agent = db.query(MarketingAgent).filter(MarketingAgent.id == trip.agent_id).first() if trip.agent_id else None
    package = db.query(Package).filter(Package.id == trip.package_id).first() if trip.package_id else None
    is_cleared = db.query(TripClearance).filter(TripClearance.trip_id == trip.id).first() is not None
    return {
        "id": str(trip.id),
        "trip_no": trip.trip_no,
        "status": trip.status.value,
        "package_flag": trip.package_flag.value,
        "arrival_date": trip.arrival_date.isoformat(),
        "departure_date": trip.departure_date.isoformat(),
        "guest_name": guest.name if guest else None,
        "guest_membership_no": guest.membership_no if guest else None,
        "agent_name": agent.name if agent else None,
        "package_code": package.code if package else None,
        "group_id": str(trip.group_id) if trip.group_id else None,
        "companion_count": len(trip.companions),
        "is_cleared": is_cleared,
    }


# ------------------------------------------------------------------ list ---
@router.get("")
def list_trips(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    agent_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*ALL_STAFF_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    q = _visible_trip_query(db, current_user, tenant_id)
    if status_filter:
        q = q.filter(Trip.status == TripStatus(status_filter))
    if agent_id:
        q = q.filter(Trip.agent_id == agent_id)
    if group_id:
        q = q.filter(Trip.group_id == group_id)
    q = q.order_by(Trip.created_at.desc())
    items, total, total_pages = paginate_query(q, page, page_size)
    return {
        "items": [_serialize_trip_summary(db, t) for t in items],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


# ---------------------------------------------------------------- create ---
@router.post("")
def create_trip(
    payload: TripRequestIn,
    submit: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.MARKETING)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    _validate_dates(payload.arrival_date, payload.departure_date)
    if submit:
        errors = []
        if not payload.guest.passport_no:
            errors.append("Passport number")
        if not payload.guest.passport_expiry:
            errors.append("Passport expiry")
        if not payload.guest.dob:
            errors.append("Date of birth")
        if not payload.package_id:
            errors.append("Package code")
        for i, c in enumerate(payload.companions):
            if not c.passport_no:
                errors.append(f"Companion {i + 1}: passport number")
        if errors:
            raise bad_request("Cannot submit — missing: " + ", ".join(errors))

    guest = _upsert_guest(db, tenant_id, payload.guest)
    trip = Trip(
        tenant_id=tenant_id,
        trip_no=next_trip_no(db, tenant_id),
        guest_id=guest.id,
        agent_id=current_user.agent_id,
        package_id=payload.package_id,
        arrival_date=payload.arrival_date,
        departure_date=payload.departure_date,
        status=TripStatus.SUBMITTED if submit else TripStatus.DRAFT,
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(trip)
    db.flush()
    for c in payload.companions:
        db.add(Companion(tenant_id=tenant_id, trip_id=trip.id, name=c.name, relationship_=c.relationship, passport_no=c.passport_no, passport_expiry=c.passport_expiry, dob=c.dob, nationality=c.nationality, visa_status=c.visa_status))
    db.commit()
    db.refresh(trip)

    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="TRIP_SUBMITTED" if submit else "TRIP_CREATED",
        description=("Request submitted" if submit else "Draft created") + f" for {guest.name}"
        + (f" (+{len(payload.companions)} companion{'s' if len(payload.companions) != 1 else ''})" if submit and payload.companions else ""),
        new_value=trip.status.value,
    )
    if submit:
        notify_role(db, tenant_id, NotificationRole.COORDINATOR, f"New guest arrival request: {guest.name} · {trip.trip_no}", trip.id)
    return _serialize_trip_summary(db, trip)


@router.patch("/{trip_id}/draft")
def update_draft(
    trip_id: uuid.UUID,
    payload: TripRequestIn,
    submit: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.MARKETING)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    if trip.agent_id != current_user.agent_id:
        raise forbidden("You may only edit your own drafts.")
    if trip.status != TripStatus.DRAFT:
        raise conflict("Only draft requests can be edited this way.")
    _validate_dates(payload.arrival_date, payload.departure_date)

    guest = _upsert_guest(db, tenant_id, payload.guest)
    trip.guest_id = guest.id
    trip.arrival_date = payload.arrival_date
    trip.departure_date = payload.departure_date
    trip.package_id = payload.package_id
    trip.notes = payload.notes

    db.query(Companion).filter(Companion.trip_id == trip.id).delete()
    for c in payload.companions:
        db.add(Companion(tenant_id=tenant_id, trip_id=trip.id, name=c.name, relationship_=c.relationship, passport_no=c.passport_no, passport_expiry=c.passport_expiry, dob=c.dob, nationality=c.nationality, visa_status=c.visa_status))

    if submit:
        trip.status = TripStatus.SUBMITTED
    db.commit()
    db.refresh(trip)
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="TRIP_SUBMITTED" if submit else "DRAFT_SAVED",
        description=("Request submitted" if submit else "Draft saved") + f" for {guest.name}",
    )
    if submit:
        notify_role(db, tenant_id, NotificationRole.COORDINATOR, f"New guest arrival request: {guest.name} · {trip.trip_no}", trip.id)
    return _serialize_trip_summary(db, trip)


class EditTripIn(BaseModel):
    arrival_date: date | None = None
    departure_date: date | None = None
    package_id: uuid.UUID | None = None
    notes: str | None = None
    reason: str | None = None


@router.patch("/{trip_id}")
def edit_trip(
    trip_id: uuid.UUID,
    payload: EditTripIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    need_reason = trip.status != TripStatus.DRAFT
    new_arrival = payload.arrival_date or trip.arrival_date
    new_departure = payload.departure_date or trip.departure_date
    _validate_dates(new_arrival, new_departure)

    changes = []
    if new_arrival != trip.arrival_date:
        changes.append(("Arrival", trip.arrival_date.isoformat(), new_arrival.isoformat()))
    if new_departure != trip.departure_date:
        changes.append(("Departure", trip.departure_date.isoformat(), new_departure.isoformat()))
    if payload.package_id and payload.package_id != trip.package_id:
        changes.append(("Package", str(trip.package_id), str(payload.package_id)))
    if payload.notes is not None and payload.notes != (trip.notes or ""):
        changes.append(("Notes", trip.notes or "—", payload.notes or "—"))

    if not changes:
        return _serialize_trip_summary(db, trip)
    if need_reason and not (payload.reason and payload.reason.strip()):
        raise bad_request("A reason is required for post-submission edits.")

    trip.arrival_date = new_arrival
    trip.departure_date = new_departure
    if payload.package_id:
        trip.package_id = payload.package_id
    if payload.notes is not None:
        trip.notes = payload.notes
    db.commit()

    for field, old, new in changes:
        record_event(
            db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
            trip_id=trip.id, action="TRIP_EDIT", description=f"{field} changed", old_value=old, new_value=new,
            reason=payload.reason,
        )
    return _serialize_trip_summary(db, trip)


# ---------------------------------------------------------------- detail ---
@router.get("/{trip_id}")
def get_trip(
    trip_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*ALL_STAFF_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    if current_user.role == UserRole.MARKETING and trip.agent_id != current_user.agent_id:
        raise forbidden("You may only view your own trips.")

    guest = db.query(Guest).filter(Guest.id == trip.guest_id).first()
    agent = db.query(MarketingAgent).filter(MarketingAgent.id == trip.agent_id).first() if trip.agent_id else None
    package = db.query(Package).filter(Package.id == trip.package_id).first() if trip.package_id else None
    clearance = (
        db.query(TripClearance).filter(TripClearance.trip_id == trip.id).order_by(TripClearance.cleared_at.desc()).first()
    )
    notes = db.query(TripNote).filter(TripNote.trip_id == trip.id).order_by(TripNote.created_at.desc()).all()
    handover = (
        db.query(TripHandover)
        .filter(TripHandover.trip_id == trip.id, TripHandover.superseded_at.is_(None))
        .order_by(TripHandover.created_at.desc())
        .first()
    )

    return {
        "id": str(trip.id),
        "trip_no": trip.trip_no,
        "status": trip.status.value,
        "package_flag": trip.package_flag.value,
        "arrival_date": trip.arrival_date.isoformat(),
        "departure_date": trip.departure_date.isoformat(),
        "notes": trip.notes,
        "group_id": str(trip.group_id) if trip.group_id else None,
        "guest": {
            "id": str(guest.id),
            "name": guest.name,
            "membership_no": guest.membership_no,
            "nationality": guest.nationality,
            "mobile": guest.mobile,
            "whatsapp": guest.whatsapp,
            "email": guest.email,
            "passport_no": guest.passport_no,
            "passport_expiry": guest.passport_expiry.isoformat() if guest.passport_expiry else None,
            "dob": guest.dob.isoformat() if guest.dob else None,
            "visa_status": guest.visa_status,
            "preferences": {
                "dietary": guest.preferences.dietary if guest.preferences else None,
                "beverage": guest.preferences.beverage if guest.preferences else None,
                "room": guest.preferences.room if guest.preferences else None,
                "language": guest.preferences.language if guest.preferences else None,
                "vip_level": guest.preferences.vip_level if guest.preferences else None,
                "signboard_name": guest.preferences.signboard_name if guest.preferences else None,
                "notes": guest.preferences.notes if guest.preferences else None,
            },
        } if guest else None,
        "companions": [
            {
                "id": str(c.id), "name": c.name, "relationship": c.relationship_, "passport_no": c.passport_no,
                "passport_expiry": c.passport_expiry.isoformat() if c.passport_expiry else None,
                "dob": c.dob.isoformat() if c.dob else None, "nationality": c.nationality, "visa_status": c.visa_status,
            }
            for c in trip.companions
        ],
        "agent": {"id": str(agent.id), "name": agent.name} if agent else None,
        "package": {"id": str(package.id), "code": package.code, "label": package.label} if package else None,
        "clearance": {
            "cleared_by_name": clearance.cleared_by_name, "reference": clearance.reference,
            "cleared_at": clearance.cleared_at.isoformat(), "is_override": clearance.is_override,
        } if clearance else None,
        "notes_log": [
            {"id": str(n.id), "note_type": n.note_type.value, "text": n.text, "created_at": n.created_at.isoformat()}
            for n in notes
        ],
        "handover": {
            "id": str(handover.id), "text": handover.text, "created_at": handover.created_at.isoformat(),
            "acknowledged_by": str(handover.acknowledged_by) if handover.acknowledged_by else None,
            "acknowledged_at": handover.acknowledged_at.isoformat() if handover.acknowledged_at else None,
        } if handover else None,
        "checklist": full_checklist(db, trip),
        "allowed_next_statuses": [s.value for s in ALLOWED_STATUS_TRANSITIONS.get(trip.status, [])],
    }


# -------------------------------------------------------------- status ----
class StatusChangeIn(BaseModel):
    to: TripStatus
    reason: str | None = None


@router.post("/{trip_id}/status")
def change_status(
    trip_id: uuid.UUID,
    payload: StatusChangeIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    validate_transition(db, trip, payload.to, payload.reason)
    old = trip.status
    trip.status = payload.to
    if payload.to == TripStatus.CANCELLED:
        trip.cancel_reason = payload.reason
    db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="STATUS_CHANGE", description="Status changed", old_value=old.value, new_value=payload.to.value,
        reason=payload.reason,
    )
    return _serialize_trip_summary(db, trip)


# ------------------------------------------------------------- clearance --
class ClearanceIn(BaseModel):
    cleared_by_name: str
    reference: str
    override: bool = False
    override_reason: str | None = None


@router.post("/{trip_id}/clearance")
def record_clearance(
    trip_id: uuid.UUID,
    payload: ClearanceIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*CAN_RECORD_CLEARANCE)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    if not payload.cleared_by_name.strip() or not payload.reference.strip():
        raise bad_request("Both name and reference are required.")
    if payload.override and not (payload.override_reason and payload.override_reason.strip()):
        raise bad_request("An override reason is required.")

    clearance = TripClearance(
        tenant_id=tenant_id, trip_id=trip.id, cleared_by_name=payload.cleared_by_name.strip(),
        reference=payload.reference.strip(), cleared_at=now_utc(), recorded_by=current_user.id,
        is_override=payload.override, override_reason=payload.override_reason, created_at=now_utc(),
    )
    db.add(clearance)
    old = trip.status
    if trip.status == TripStatus.SUBMITTED:
        trip.status = TripStatus.CLEARED
    db.commit()

    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="CLEARED_TO_BOOK",
        description=f"Cleared by {payload.cleared_by_name} ({payload.reference})" + (" [ADMIN OVERRIDE]" if payload.override else ""),
        old_value=old.value, new_value=trip.status.value, reason=payload.override_reason if payload.override else None,
    )
    guest = db.query(Guest).filter(Guest.id == trip.guest_id).first()
    notify_role(db, tenant_id, NotificationRole.RESERVATIONS, f"Cleared to book: {guest.name if guest else ''} · {trip.trip_no}", trip.id)
    notify_role(db, tenant_id, NotificationRole.TRANSPORT, f"Cleared to book: {trip.trip_no} · arrival {trip.arrival_date}", trip.id)
    return _serialize_trip_summary(db, trip)


# ----------------------------------------------------------------- notes --
class NoteIn(BaseModel):
    note_type: NoteType = NoteType.GENERAL
    text: str


@router.post("/{trip_id}/notes")
def add_note(
    trip_id: uuid.UUID,
    payload: NoteIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    if not payload.text.strip():
        raise bad_request("Note text is required.")
    note = TripNote(tenant_id=tenant_id, trip_id=trip.id, note_type=payload.note_type, text=payload.text, created_by=current_user.id, created_at=now_utc())
    db.add(note)
    db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="NOTE", description=payload.text, note_type=payload.note_type.value,
    )
    return {"ok": True}


# -------------------------------------------------------------- handover --
class HandoverIn(BaseModel):
    text: str


@router.post("/{trip_id}/handover")
def create_handover(
    trip_id: uuid.UUID,
    payload: HandoverIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    if not payload.text.strip():
        raise bad_request("Handover text is required.")
    # supersede (not overwrite) any unacknowledged handover — preserves history
    db.query(TripHandover).filter(TripHandover.trip_id == trip.id, TripHandover.superseded_at.is_(None)).update(
        {"superseded_at": now_utc()}
    )
    handover = TripHandover(tenant_id=tenant_id, trip_id=trip.id, text=payload.text, created_by=current_user.id, created_at=now_utc())
    db.add(handover)
    db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="HANDOVER_SET", description=payload.text,
    )
    return {"ok": True}


@router.post("/{trip_id}/handover/ack")
def ack_handover(
    trip_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    handover = (
        db.query(TripHandover)
        .filter(TripHandover.trip_id == trip.id, TripHandover.superseded_at.is_(None), TripHandover.acknowledged_by.is_(None))
        .order_by(TripHandover.created_at.desc())
        .first()
    )
    if not handover:
        raise not_found("No pending handover to acknowledge.")
    handover.acknowledged_by = current_user.id
    handover.acknowledged_at = now_utc()
    db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="HANDOVER_ACK", description=f'Handover acknowledged: "{handover.text}"',
    )
    return {"ok": True}


# ------------------------------------------------------------- checklist --
class NAIn(BaseModel):
    reason: str


@router.post("/{trip_id}/checklist/{item_key}/na")
def mark_na(
    trip_id: uuid.UUID,
    item_key: ChecklistItemKey,
    payload: NAIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    if item_key not in NA_ELIGIBLE_CHECKLIST_ITEMS:
        raise bad_request("This checklist item cannot be marked N/A.")
    if not payload.reason.strip():
        raise bad_request("A reason is required.")
    row = db.query(TripChecklistItem).filter(TripChecklistItem.trip_id == trip.id, TripChecklistItem.item_key == item_key).first()
    if not row:
        row = TripChecklistItem(tenant_id=tenant_id, trip_id=trip.id, item_key=item_key)
        db.add(row)
    row.is_not_applicable = True
    row.na_reason = payload.reason
    row.na_by = current_user.id
    row.na_at = now_utc()
    db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="CHECKLIST_NA", description=f'"{item_key.value}" marked N/A', reason=payload.reason,
    )
    return {"ok": True}


@router.delete("/{trip_id}/checklist/{item_key}/na")
def clear_na(
    trip_id: uuid.UUID,
    item_key: ChecklistItemKey,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    trip = _trip_or_404(db, trip_id, tenant_id)
    row = db.query(TripChecklistItem).filter(TripChecklistItem.trip_id == trip.id, TripChecklistItem.item_key == item_key).first()
    if row:
        row.is_not_applicable = False
        db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="CHECKLIST_NA_CLEARED", description=f'N/A removed from "{item_key.value}"',
    )
    return {"ok": True}
