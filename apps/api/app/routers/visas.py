"""Visa lane — per-traveller, Coordinator-owned. Fee Guide pre-fills but is
always editable per application (never a hard rule) — feature-inventory §8."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.core.permissions import CAN_EDIT_VISA_LANE
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.booking import VisaApplication, VisaStatus
from app.models.enums import UserRole, VisaTravellerType
from app.models.guest import Guest
from app.models.master_data import VisaFeeGuide
from app.models.trip import Companion, Trip
from app.services.audit import record_event

router = APIRouter(prefix="/api/visas", tags=["visas"])

READ_ROLES = (UserRole.COORDINATOR, UserRole.RESERVATIONS, UserRole.TENANT_ADMIN, UserRole.MANAGER)


def _fee_guide(db: Session, tenant_id: uuid.UUID, nationality: str | None) -> float | None:
    rows = db.query(VisaFeeGuide).filter(VisaFeeGuide.tenant_id == tenant_id, VisaFeeGuide.is_active.is_(True)).all()
    hit = next((r for r in rows if nationality and r.nationality_group.lower() == nationality.lower()), None)
    if not hit:
        hit = next((r for r in rows if r.nationality_group == "Other nationalities"), None)
    return float(hit.fee_usd) if hit else None


def _map_status(guest_visa_status: str | None) -> VisaStatus:
    if guest_visa_status == "Granted":
        return VisaStatus.GRANTED
    if guest_visa_status == "Visa on arrival":
        return VisaStatus.ON_ARRIVAL
    return VisaStatus.TO_APPLY


def ensure_visas(db: Session, trip: Trip, tenant_id: uuid.UUID) -> list[VisaApplication]:
    existing = db.query(VisaApplication).filter(VisaApplication.trip_id == trip.id).all()
    if existing:
        return existing
    guest = db.query(Guest).filter(Guest.id == trip.guest_id).first()
    rows = [
        VisaApplication(
            tenant_id=tenant_id, trip_id=trip.id, traveller_type=VisaTravellerType.GUEST, traveller_ref_id=guest.id,
            traveller_name=guest.name, passport_no=guest.passport_no, dob=guest.dob,
            nationality=guest.nationality or "Other nationalities", status=_map_status(guest.visa_status),
        )
    ]
    for c in trip.companions:
        rows.append(
            VisaApplication(
                tenant_id=tenant_id, trip_id=trip.id, traveller_type=VisaTravellerType.COMPANION, traveller_ref_id=c.id,
                traveller_name=c.name, passport_no=c.passport_no, dob=c.dob,
                nationality=c.nationality or guest.nationality or "Other nationalities", status=_map_status(c.visa_status),
            )
        )
    db.add_all(rows)
    db.commit()
    return db.query(VisaApplication).filter(VisaApplication.trip_id == trip.id).all()


def _out(v: VisaApplication, fee_guide_hint: float | None) -> dict:
    return {
        "id": str(v.id), "traveller_type": v.traveller_type.value, "traveller_name": v.traveller_name,
        "passport_no": v.passport_no, "dob": v.dob.isoformat() if v.dob else None, "nationality": v.nationality,
        "status": v.status.value, "eta_reference": v.eta_reference,
        "application_date": v.application_date.isoformat() if v.application_date else None,
        "fee_usd": float(v.fee_usd) if v.fee_usd is not None else fee_guide_hint,
        "lkr_equivalent": float(v.lkr_equivalent) if v.lkr_equivalent is not None else None,
        "payment_status": v.payment_status.value, "reason": v.reason,
    }


@router.get("/trips/{trip_id}")
def list_visas(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    visas = ensure_visas(db, trip, tenant_id)
    return [_out(v, _fee_guide(db, tenant_id, v.nationality)) for v in visas]


class VisaUpdateIn(BaseModel):
    status: VisaStatus
    nationality: str | None = None
    eta_reference: str | None = None
    application_date: date | None = None
    fee_usd: float
    lkr_equivalent: float | None = None
    reason: str | None = None


@router.patch("/{visa_id}")
def update_visa(visa_id: uuid.UUID, payload: VisaUpdateIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_EDIT_VISA_LANE)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    v = db.query(VisaApplication).filter(VisaApplication.id == visa_id, VisaApplication.tenant_id == tenant_id).first()
    if not v:
        raise not_found("Visa record not found.")

    if payload.status in (VisaStatus.APPLIED, VisaStatus.GRANTED) and not payload.eta_reference:
        raise bad_request(f"ETA reference is required for {payload.status.value}.")
    if payload.status == VisaStatus.APPLIED and not payload.application_date:
        raise bad_request("Application date is required.")
    if payload.status in (VisaStatus.NOT_REQUIRED, VisaStatus.ON_ARRIVAL) and not (payload.reason and payload.reason.strip()):
        raise bad_request(f"A reason is required for {payload.status.value}.")
    if payload.fee_usd > 0 and payload.lkr_equivalent is None:
        raise bad_request("LKR equivalent is required when the fee is greater than zero.")

    changes = []
    for field, new in [
        ("status", payload.status.value), ("eta_reference", payload.eta_reference), ("application_date", str(payload.application_date) if payload.application_date else None),
        ("nationality", payload.nationality), ("fee_usd", payload.fee_usd), ("lkr_equivalent", payload.lkr_equivalent), ("reason", payload.reason),
    ]:
        old = getattr(v, field)
        old_s = old.value if hasattr(old, "value") else (str(old) if old is not None else None)
        if str(old_s or "") != str(new or ""):
            changes.append((field, old_s, new))

    v.status = payload.status
    v.eta_reference = payload.eta_reference
    v.application_date = payload.application_date
    if payload.nationality:
        v.nationality = payload.nationality
    v.fee_usd = payload.fee_usd
    v.lkr_equivalent = payload.lkr_equivalent
    v.reason = payload.reason
    v.updated_by = current_user.id
    db.commit()

    for field, old, new in changes:
        record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=v.trip_id, action="VISA_UPDATE", description=f"Visa ({v.traveller_name}) {field} changed", old_value=old, new_value=str(new))
    return _out(v, None)
