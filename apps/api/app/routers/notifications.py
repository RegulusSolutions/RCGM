import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_tenant_user
from app.models.enums import NotificationRole
from app.models.notification import Notification
from app.security import now_utc

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _out(n: Notification) -> dict:
    return {
        "id": str(n.id), "message": n.message, "trip_id": str(n.trip_id) if n.trip_id else None,
        "is_read": n.is_read, "created_at": n.created_at.isoformat(),
        "read_at": n.read_at.isoformat() if n.read_at else None,
    }


def _visible_query(db: Session, current_user: CurrentUser, tenant_id: uuid.UUID):
    role_name = NotificationRole(current_user.role.value)
    return db.query(Notification).filter(
        Notification.tenant_id == tenant_id,
        or_(Notification.recipient_role == role_name, Notification.recipient_user_id == current_user.id),
    )


@router.get("")
def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_tenant_user),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    q = _visible_query(db, current_user, tenant_id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    rows = q.order_by(Notification.created_at.desc()).limit(limit).all()
    unread_count = _visible_query(db, current_user, tenant_id).filter(Notification.is_read.is_(False)).count()
    return {"items": [_out(n) for n in rows], "unread_count": unread_count}


@router.post("/{notification_id}/read")
def mark_read(notification_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_tenant_user), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    n = _visible_query(db, current_user, tenant_id).filter(Notification.id == notification_id).first()
    if not n:
        raise not_found("Notification not found.")
    if not n.is_read:
        n.is_read = True
        n.read_at = now_utc()
        db.commit()
    return _out(n)


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_tenant_user), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    rows = _visible_query(db, current_user, tenant_id).filter(Notification.is_read.is_(False)).all()
    for n in rows:
        n.is_read = True
        n.read_at = now_utc()
    db.commit()
    return {"updated": len(rows)}
