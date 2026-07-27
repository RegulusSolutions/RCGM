"""Generic CRUD for the 8 tenant master-data catalogues (hotels, airlines,
vehicles+drivers, transport vendors, packages, marketing agents, currencies,
visa fee guides).

A single generic factory (`_build_catalog_router`) is used instead of eight
near-identical CRUD modules, per the DRY principle — each catalogue only
supplies its model class and field list. Deactivation is always soft
(`is_active` flag) — hard delete is never exposed, matching the prototype's
explicit "never delete master data" rule.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.core.errors import bad_request, forbidden, not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role, require_tenant_user
from app.models.enums import UserRole
from app.models.master_data import (
    Airline,
    Currency,
    Driver,
    Hotel,
    MarketingAgent,
    Package,
    TransportVendor,
    Vehicle,
    VisaFeeGuide,
)
from app.services.audit import record_event

router = APIRouter(prefix="/api/master-data", tags=["master-data"])

READ_ROLES = (UserRole.TENANT_ADMIN, UserRole.COORDINATOR)
WRITE_ROLES = (UserRole.TENANT_ADMIN,)

CATALOGS: dict[str, dict[str, Any]] = {
    "hotels": {"model": Hotel, "fields": ["name", "location", "room_types"], "required": ["name"], "label": "Hotels"},
    "airlines": {"model": Airline, "fields": ["name", "travel_classes"], "required": ["name"], "label": "Airlines"},
    "drivers": {"model": Driver, "fields": ["name", "mobile"], "required": ["name"], "label": "Drivers"},
    "vehicles": {"model": Vehicle, "fields": ["vehicle_no", "vehicle_type", "capacity", "driver_id"], "required": ["vehicle_no", "vehicle_type"], "label": "In-house Fleet"},
    "vendors": {"model": TransportVendor, "fields": ["name", "contact", "vehicle_types_offered"], "required": ["name"], "label": "Transport Vendors"},
    "packages": {"model": Package, "fields": ["code", "label"], "required": ["code", "label"], "label": "Package Codes"},
    "agents": {"model": MarketingAgent, "fields": ["name", "market", "mobile", "email"], "required": ["name"], "label": "Marketing Agents"},
    "currencies": {"model": Currency, "fields": ["code", "name", "is_base"], "required": ["code"], "label": "Currencies"},
    "visa-fees": {"model": VisaFeeGuide, "fields": ["nationality_group", "fee_usd", "notes"], "required": ["nationality_group", "fee_usd"], "label": "Visa Fee Guide"},
}


def _serialize(obj, fields: list[str]) -> dict:
    out = {"id": str(obj.id), "is_active": obj.is_active}
    for f in fields:
        v = getattr(obj, f)
        out[f] = str(v) if isinstance(v, uuid.UUID) else v
    return out


@router.get("/{catalog}")
def list_catalog(
    catalog: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*READ_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    cfg = CATALOGS.get(catalog)
    if not cfg:
        raise not_found("Unknown catalog.")
    rows = db.query(cfg["model"]).filter(cfg["model"].tenant_id == tenant_id).order_by(cfg["model"].created_at).all()
    return [_serialize(r, cfg["fields"]) for r in rows]


@router.post("/{catalog}")
def create_catalog_item(
    catalog: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*WRITE_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    cfg = CATALOGS.get(catalog)
    if not cfg:
        raise not_found("Unknown catalog.")
    missing = [f for f in cfg["required"] if not payload.get(f) and payload.get(f) != 0]
    if missing:
        raise bad_request(f"Required: {', '.join(missing)}")
    kwargs = {f: payload.get(f) for f in cfg["fields"]}
    if catalog == "currencies":
        kwargs["code"] = str(kwargs["code"]).upper()
    obj = cfg["model"](tenant_id=tenant_id, is_active=True, **kwargs)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    label = payload.get("name") or payload.get("code") or payload.get("vehicle_no") or payload.get("nationality_group") or "entry"
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        action="MASTER_ADD", description=f'{cfg["label"]} — added "{label}"',
    )
    return _serialize(obj, cfg["fields"])


@router.patch("/{catalog}/{item_id}")
def update_catalog_item(
    catalog: str,
    item_id: uuid.UUID,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*WRITE_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    cfg = CATALOGS.get(catalog)
    if not cfg:
        raise not_found("Unknown catalog.")
    obj = db.query(cfg["model"]).filter(cfg["model"].id == item_id, cfg["model"].tenant_id == tenant_id).first()
    if not obj:
        raise not_found("Entry not found.")
    changes = []
    for f in cfg["fields"]:
        if f in payload and payload[f] != getattr(obj, f):
            changes.append(f"{f}: {getattr(obj, f)!r} -> {payload[f]!r}")
            setattr(obj, f, payload[f])
    db.commit()
    if changes:
        record_event(
            db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
            action="MASTER_EDIT", description=f'{cfg["label"]} — ' + "; ".join(changes),
        )
    return _serialize(obj, cfg["fields"])


@router.post("/{catalog}/{item_id}/toggle-active")
def toggle_catalog_item(
    catalog: str,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(*WRITE_ROLES)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    cfg = CATALOGS.get(catalog)
    if not cfg:
        raise not_found("Unknown catalog.")
    obj = db.query(cfg["model"]).filter(cfg["model"].id == item_id, cfg["model"].tenant_id == tenant_id).first()
    if not obj:
        raise not_found("Entry not found.")
    if catalog == "currencies" and getattr(obj, "is_base", False):
        raise forbidden("The base currency cannot be deactivated.")
    obj.is_active = not obj.is_active
    db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        action="MASTER_REACTIVATE" if obj.is_active else "MASTER_DEACTIVATE", description=f'{cfg["label"]} entry {item_id}',
    )
    return _serialize(obj, cfg["fields"])
