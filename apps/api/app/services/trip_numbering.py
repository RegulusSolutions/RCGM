"""Tenant-scoped sequential number generation for trips/groups/bookings,
mirroring the prototype's `TRIP-<CODE>-<year>-<seq>` / `GRP-...` / `BK-<CODE>-<seq>` scheme.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tenant import Tenant


def _lock_tenant(db: Session, tenant_id) -> Tenant:
    # SELECT ... FOR UPDATE avoids two concurrent requests reusing the same sequence number.
    return db.execute(select(Tenant).where(Tenant.id == tenant_id).with_for_update()).scalar_one()


def next_trip_no(db: Session, tenant_id) -> str:
    tenant = _lock_tenant(db, tenant_id)
    tenant.seq_trip += 1
    db.flush()
    return f"TRIP-{tenant.code}-{datetime.utcnow().year}-{tenant.seq_trip:04d}"


def next_group_no(db: Session, tenant_id) -> str:
    tenant = _lock_tenant(db, tenant_id)
    tenant.seq_group += 1
    db.flush()
    return f"GRP-{tenant.code}-{datetime.utcnow().year}-{tenant.seq_group:04d}"


def next_booking_no(db: Session, tenant_id) -> str:
    tenant = _lock_tenant(db, tenant_id)
    tenant.seq_booking += 1
    db.flush()
    return f"BK-{tenant.code}-{tenant.seq_booking:05d}"
