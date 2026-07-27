import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.database import get_db
from app.deps import CurrentUser, require_role
from app.models.enums import UserRole
from app.models.tenant import Tenant, TenantSettings
from app.services.audit import record_event

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


class TenantOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    location: str | None
    is_active: bool

    class Config:
        from_attributes = True


class TenantCreate(BaseModel):
    code: str
    name: str
    location: str | None = None


@router.get("", response_model=list[TenantOut])
def list_tenants(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.SUPER_ADMIN))):
    return db.query(Tenant).order_by(Tenant.created_at.desc()).all()


@router.get("/stats")
def platform_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.SUPER_ADMIN))):
    from app.models.audit import AuditEvent
    from app.models.user import User

    return {
        "tenants": db.query(Tenant).count(),
        "active_tenants": db.query(Tenant).filter(Tenant.is_active.is_(True)).count(),
        "users": db.query(User).count(),
        "audit_events": db.query(AuditEvent).count(),
    }


@router.post("", response_model=TenantOut)
def create_tenant(payload: TenantCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.SUPER_ADMIN))):
    code = payload.code.strip().upper()
    if not code or not payload.name.strip():
        raise bad_request("Name and code are required.")
    if db.query(Tenant).filter(Tenant.code == code).first():
        raise bad_request("Tenant code already exists.")
    tenant = Tenant(code=code, name=payload.name.strip(), location=payload.location)
    db.add(tenant)
    db.flush()
    db.add(TenantSettings(tenant_id=tenant.id))
    db.commit()
    db.refresh(tenant)
    record_event(
        db,
        tenant_id=tenant.id,
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role.value,
        action="TENANT_CREATED",
        description=f"Tenant {tenant.name} ({tenant.code}) created",
    )
    return tenant


@router.post("/{tenant_id}/toggle-active", response_model=TenantOut)
def toggle_tenant(tenant_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.SUPER_ADMIN))):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise not_found("Tenant not found.")
    tenant.is_active = not tenant.is_active
    db.commit()
    db.refresh(tenant)
    record_event(
        db,
        tenant_id=tenant.id,
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role.value,
        action="TENANT_REACTIVATED" if tenant.is_active else "TENANT_DEACTIVATED",
        description=f"{tenant.name} ({tenant.code})",
    )
    return tenant
