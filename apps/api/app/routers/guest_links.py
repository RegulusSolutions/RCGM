"""Guest itinerary share-link management (Coordinator side). The public,
unauthenticated read endpoint that guests actually open lives in
`app/routers/public.py`."""
import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import UserRole
from app.models.guest_link import GuestShareLink
from app.models.tenant import Tenant
from app.models.trip import Trip
from app.security import generate_session_token, hash_token, now_utc
from app.services.audit import record_event

router = APIRouter(prefix="/api/guest-links", tags=["guest-links"])


def _out(link: GuestShareLink, token: str | None = None) -> dict:
    out = {
        "id": str(link.id), "trip_id": str(link.trip_id), "created_at": link.created_at.isoformat(),
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
        "last_accessed_at": link.last_accessed_at.isoformat() if link.last_accessed_at else None,
        "access_count": link.access_count,
        "is_active": link.revoked_at is None and (link.expires_at is None or link.expires_at > now_utc()),
    }
    if token:
        out["url"] = f"/guest/{token}"
        out["token"] = token
    return out


@router.get("/trips/{trip_id}")
def list_links(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR, UserRole.TENANT_ADMIN)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    rows = db.query(GuestShareLink).filter(GuestShareLink.trip_id == trip_id, GuestShareLink.tenant_id == tenant_id).order_by(GuestShareLink.created_at.desc()).all()
    return [_out(r) for r in rows]


@router.post("/trips/{trip_id}")
def create_link(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    # Revoke any still-active prior links so only one guest link is live at a time.
    db.query(GuestShareLink).filter(GuestShareLink.trip_id == trip_id, GuestShareLink.revoked_at.is_(None)).update({"revoked_at": now_utc()})

    token = generate_session_token()
    from datetime import timedelta

    link = GuestShareLink(
        tenant_id=tenant_id, trip_id=trip_id, token_hash=hash_token(token), created_by=current_user.id,
        created_at=now_utc(), expires_at=now_utc() + timedelta(days=tenant.guest_link_expiry_days if tenant else 3),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=trip.id, action="GUEST_LINK_CREATED", description="Guest itinerary link created")
    return _out(link, token)


@router.post("/{link_id}/revoke")
def revoke_link(link_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    link = db.query(GuestShareLink).filter(GuestShareLink.id == link_id, GuestShareLink.tenant_id == tenant_id).first()
    if not link:
        raise not_found("Link not found.")
    if link.revoked_at:
        raise bad_request("Already revoked.")
    link.revoked_at = now_utc()
    db.commit()
    record_event(db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value, trip_id=link.trip_id, action="GUEST_LINK_REVOKED", description="Guest itinerary link revoked")
    return {"ok": True}
