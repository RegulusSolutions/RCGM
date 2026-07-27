"""Read-only audit trail browser. No route in this router (or anywhere else
in the app) ever updates or deletes an AuditEvent row."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.audit import AuditEvent
from app.models.enums import UserRole
from app.schemas.common import paginate_query

router = APIRouter(prefix="/api/audit", tags=["audit"])

READ_ROLES = (UserRole.COORDINATOR, UserRole.TENANT_ADMIN, UserRole.MANAGER)


def _out(e: AuditEvent) -> dict:
    return {
        "id": str(e.id), "username": e.username, "role": e.role, "action": e.action,
        "entity_type": e.entity_type, "entity_id": e.entity_id, "trip_id": str(e.trip_id) if e.trip_id else None,
        "description": e.description, "old_value": e.old_value, "new_value": e.new_value, "reason": e.reason,
        "ip_address": e.ip_address, "created_at": e.created_at.isoformat(),
    }


@router.get("")
def list_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str | None = None,
    trip_id: uuid.UUID | None = None,
    username: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*READ_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    q = db.query(AuditEvent).filter(AuditEvent.tenant_id == tenant_id)
    if action:
        q = q.filter(AuditEvent.action == action)
    if trip_id:
        q = q.filter(AuditEvent.trip_id == trip_id)
    if username:
        q = q.filter(AuditEvent.username.ilike(f"%{username}%"))
    if date_from:
        q = q.filter(AuditEvent.created_at >= date_from)
    if date_to:
        q = q.filter(AuditEvent.created_at <= date_to)
    q = q.order_by(AuditEvent.created_at.desc())
    items, total, total_pages = paginate_query(q, page, page_size)
    return {"items": [_out(e) for e in items], "page": page, "page_size": page_size, "total": total, "total_pages": total_pages}


@router.get("/platform")
def platform_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    q = db.query(AuditEvent).filter(AuditEvent.tenant_id.is_(None)).order_by(AuditEvent.created_at.desc())
    items, total, total_pages = paginate_query(q, page, page_size)
    return {"items": [_out(e) for e in items], "page": page, "page_size": page_size, "total": total, "total_pages": total_pages}
