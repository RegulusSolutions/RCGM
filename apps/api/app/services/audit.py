"""Append-only audit event service.

Every mutation point identified in docs/feature-inventory.md §22 funnels
through `record_event()`. No code path in this application ever issues an
UPDATE or DELETE against `audit_events`.
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditEvent
from app.security import now_utc


def record_event(
    db: Session,
    *,
    tenant_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    username: str,
    role: str,
    action: str,
    description: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    trip_id: uuid.UUID | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    reason: str | None = None,
    note_type: str | None = None,
    ip_address: str | None = None,
    commit: bool = True,
) -> AuditEvent:
    event = AuditEvent(
        tenant_id=tenant_id,
        user_id=user_id,
        username=username,
        role=role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        trip_id=trip_id,
        description=description,
        old_value=old_value,
        new_value=new_value,
        reason=reason,
        note_type=note_type,
        ip_address=ip_address,
        created_at=now_utc(),
    )
    db.add(event)
    if commit:
        db.commit()
        db.refresh(event)
    return event
