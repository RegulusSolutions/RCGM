"""In-app notification service (server-backed, polling-based for the first
local version — see docs/architecture.md §6 for the WebSocket/SSE upgrade path).
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.enums import NotificationRole
from app.models.notification import Notification
from app.security import now_utc


def notify_role(db: Session, tenant_id: uuid.UUID, role: NotificationRole, message: str, trip_id: uuid.UUID | None = None) -> Notification:
    n = Notification(tenant_id=tenant_id, recipient_role=role, trip_id=trip_id, message=message, created_at=now_utc())
    db.add(n)
    db.commit()
    return n


def notify_user(db: Session, tenant_id: uuid.UUID, user_id: uuid.UUID, message: str, trip_id: uuid.UUID | None = None) -> Notification:
    n = Notification(tenant_id=tenant_id, recipient_user_id=user_id, trip_id=trip_id, message=message, created_at=now_utc())
    db.add(n)
    db.commit()
    return n
