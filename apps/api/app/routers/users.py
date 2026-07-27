import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import bad_request, forbidden, not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import UserRole
from app.models.user import User
from app.security import hash_password, now_utc
from app.services.audit import record_event

router = APIRouter(prefix="/api/users", tags=["users"])


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    name: str
    role: UserRole
    is_active: bool
    can_mark_paid: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    role: UserRole
    can_mark_paid: bool = False
    agent_id: uuid.UUID | None = None


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.TENANT_ADMIN)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    return db.query(User).filter(User.tenant_id == tenant_id).order_by(User.created_at).all()


@router.post("", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.TENANT_ADMIN)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    if payload.role == UserRole.SUPER_ADMIN:
        raise forbidden("Cannot create a platform administrator from a tenant.")
    if db.query(User).filter(User.username == payload.username).first():
        raise bad_request("Username already exists.")
    user = User(
        tenant_id=tenant_id,
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        name=payload.name.strip(),
        role=payload.role,
        can_mark_paid=payload.can_mark_paid,
        agent_id=payload.agent_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    record_event(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role.value,
        action="USER_CREATED",
        description=f"{user.name} ({user.username}) added as {user.role.value}" + (" with Mark-Paid permission" if user.can_mark_paid else ""),
    )
    return user


@router.post("/{user_id}/toggle-active", response_model=UserOut)
def toggle_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.TENANT_ADMIN)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not user:
        raise not_found("User not found.")
    if user.id == current_user.id:
        raise bad_request("You cannot deactivate yourself.")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    record_event(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role.value,
        action="USER_REACTIVATED" if user.is_active else "USER_DEACTIVATED",
        description=f"{user.name} ({user.username})",
    )
    return user


@router.post("/{user_id}/toggle-mark-paid", response_model=UserOut)
def toggle_mark_paid(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(UserRole.TENANT_ADMIN)),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not user:
        raise not_found("User not found.")
    old = user.can_mark_paid
    user.can_mark_paid = not user.can_mark_paid
    db.commit()
    db.refresh(user)
    record_event(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role.value,
        action="PERMISSION_CHANGE",
        description=f"Mark-Paid {'granted to' if user.can_mark_paid else 'revoked from'} {user.name}",
        old_value=str(old),
        new_value=str(user.can_mark_paid),
    )
    return user
