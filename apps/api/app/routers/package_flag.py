"""Manager-controlled package qualification status. The `package` field on a
Trip is only a label; eligibility is a distinct, history-preserving decision
(see docs/feature-inventory.md §16)."""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.core.permissions import CAN_SET_PACKAGE_FLAG
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import PackageFlagStatus, UserRole
from app.models.expense import PackageQualificationFlag
from app.models.trip import Trip
from app.security import now_utc
from app.services.audit import record_event

router = APIRouter(prefix="/api/package-flag", tags=["package-flag"])

READ_ROLES = (UserRole.MANAGER, UserRole.COORDINATOR, UserRole.TENANT_ADMIN)


def _out(f: PackageQualificationFlag) -> dict:
    return {
        "id": str(f.id), "trip_id": str(f.trip_id), "status": f.status.value,
        "set_by": str(f.set_by) if f.set_by else None, "note": f.note, "set_at": f.set_at.isoformat(),
    }


@router.get("/trips/{trip_id}")
def get_flag(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    row = db.query(PackageQualificationFlag).filter(PackageQualificationFlag.trip_id == trip_id, PackageQualificationFlag.tenant_id == tenant_id, PackageQualificationFlag.is_current.is_(True)).first()
    return _out(row) if row else None


@router.get("/trips/{trip_id}/history")
def get_flag_history(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    rows = db.query(PackageQualificationFlag).filter(PackageQualificationFlag.trip_id == trip_id, PackageQualificationFlag.tenant_id == tenant_id).order_by(PackageQualificationFlag.set_at.desc()).all()
    return [_out(r) for r in rows]


class FlagIn(BaseModel):
    status: PackageFlagStatus
    note: str | None = None


@router.post("/trips/{trip_id}")
def set_flag(trip_id: uuid.UUID, payload: FlagIn, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*CAN_SET_PACKAGE_FLAG)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    if payload.status == PackageFlagStatus.NOT_QUALIFIED and not (payload.note and payload.note.strip()):
        raise bad_request("A note is required when marking Not Qualified.")

    old = trip.package_flag
    db.query(PackageQualificationFlag).filter(PackageQualificationFlag.trip_id == trip.id, PackageQualificationFlag.is_current.is_(True)).update({"is_current": False})
    row = PackageQualificationFlag(tenant_id=tenant_id, trip_id=trip.id, status=payload.status, set_by=current_user.id, note=payload.note, set_at=now_utc(), is_current=True)
    db.add(row)
    trip.package_flag = payload.status
    db.commit()
    db.refresh(row)

    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="PACKAGE_FLAG_SET", description="Package qualification status set",
        old_value=old.value, new_value=payload.status.value, reason=payload.note,
    )
    return _out(row)
