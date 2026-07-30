import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import bad_request, not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import UserRole
from app.models.tenant import Tenant, TenantSettings
from app.services.audit import record_event

router = APIRouter(prefix="/api/tenants", tags=["tenants"])
app_settings = get_settings()


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


FLAG_WINDOW_FIELDS = [
    "flight_amber_days", "flight_red_hrs",
    "hotel_amber_days", "hotel_red_hrs",
    "visa_amber_days", "visa_red_hrs",
    "pickup_amber_hrs", "pickup_red_hrs",
    "drop_amber_hrs", "drop_red_hrs",
]


class TenantSettingsOut(BaseModel):
    flight_amber_days: int
    flight_red_hrs: int
    hotel_amber_days: int
    hotel_red_hrs: int
    visa_amber_days: int
    visa_red_hrs: int
    pickup_amber_hrs: int
    pickup_red_hrs: int
    drop_amber_hrs: int
    drop_red_hrs: int
    guest_link_expiry_days: int


class TenantSettingsUpdate(BaseModel):
    flight_amber_days: int | None = None
    flight_red_hrs: int | None = None
    hotel_amber_days: int | None = None
    hotel_red_hrs: int | None = None
    visa_amber_days: int | None = None
    visa_red_hrs: int | None = None
    pickup_amber_hrs: int | None = None
    pickup_red_hrs: int | None = None
    drop_amber_hrs: int | None = None
    drop_red_hrs: int | None = None
    guest_link_expiry_days: int | None = None


def _settings_out(tenant: Tenant, settings_row: TenantSettings) -> TenantSettingsOut:
    return TenantSettingsOut(
        **{f: getattr(settings_row, f) for f in FLAG_WINDOW_FIELDS},
        guest_link_expiry_days=tenant.guest_link_expiry_days,
    )


@router.get("/settings", response_model=TenantSettingsOut)
def get_tenant_settings(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.TENANT_ADMIN, UserRole.COORDINATOR, UserRole.MANAGER)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    settings_row = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    if not tenant or not settings_row:
        raise not_found("Tenant settings not found.")
    return _settings_out(tenant, settings_row)


@router.patch("/settings", response_model=TenantSettingsOut)
def update_tenant_settings(
    payload: TenantSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.TENANT_ADMIN)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    settings_row = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    if not tenant or not settings_row:
        raise not_found("Tenant settings not found.")

    data = payload.model_dump(exclude_unset=True)
    changes: list[str] = []

    for field in FLAG_WINDOW_FIELDS:
        if field in data and data[field] is not None:
            new_val = data[field]
            if new_val < 0:
                raise bad_request(f"{field} cannot be negative.")
            old_val = getattr(settings_row, field)
            if old_val != new_val:
                changes.append(f"{field}: {old_val} -> {new_val}")
                setattr(settings_row, field, new_val)

    if "guest_link_expiry_days" in data and data["guest_link_expiry_days"] is not None:
        new_val = data["guest_link_expiry_days"]
        if new_val < 1:
            raise bad_request("guest_link_expiry_days must be at least 1.")
        if tenant.guest_link_expiry_days != new_val:
            changes.append(f"guest_link_expiry_days: {tenant.guest_link_expiry_days} -> {new_val}")
            tenant.guest_link_expiry_days = new_val

    db.commit()
    if changes:
        record_event(
            db,
            tenant_id=tenant_id,
            user_id=current_user.id,
            username=current_user.username,
            role=current_user.role.value,
            action="SETTINGS_CHANGE",
            description="Flag window / settings updated — " + "; ".join(changes),
        )
    return _settings_out(tenant, settings_row)


@router.get("/diagnostics")
def tenant_diagnostics(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.TENANT_ADMIN)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    """Server-side analogue of the prototype's browser-storage self-test:
    real DB connectivity, migration version, and file-storage reachability,
    plus tenant record counts. See docs/feature-inventory.md #23."""
    import os

    from app.models.audit import AuditEvent
    from app.models.guest import Guest
    from app.models.trip import Trip
    from app.models.user import User

    checks = {"database": "unknown", "storage": "unknown"}
    migration_version = None
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
        row = db.execute(text("SELECT version_num FROM alembic_version")).first()
        migration_version = row[0] if row else None
    except Exception:
        checks["database"] = "error"

    try:
        os.makedirs(app_settings.upload_storage_dir, exist_ok=True)
        test_path = os.path.join(app_settings.upload_storage_dir, ".health_check")
        with open(test_path, "w") as f:
            f.write("ok")
        os.remove(test_path)
        checks["storage"] = "ok"
    except Exception:
        checks["storage"] = "error"

    return {
        "checks": checks,
        "migration_version": migration_version,
        "environment": app_settings.environment,
        "counts": {
            "users": db.query(User).filter(User.tenant_id == tenant_id).count(),
            "guests": db.query(Guest).filter(Guest.tenant_id == tenant_id).count(),
            "trips": db.query(Trip).filter(Trip.tenant_id == tenant_id).count(),
            "audit_events": db.query(AuditEvent).filter(AuditEvent.tenant_id == tenant_id).count(),
        },
    }
