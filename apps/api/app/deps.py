"""Shared FastAPI dependencies: current user, RBAC, tenant scope, CSRF."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import forbidden
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User, UserSession
from app.security import hash_token, now_utc
from fastapi import HTTPException, status

settings = get_settings()


@dataclass
class CurrentUser:
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    username: str
    name: str
    role: UserRole
    agent_id: uuid.UUID | None
    can_mark_paid: bool


def get_client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> CurrentUser:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"message": "Not authenticated."})
    token_hash = hash_token(token)
    session = (
        db.query(UserSession)
        .filter(UserSession.token_hash == token_hash, UserSession.revoked_at.is_(None))
        .first()
    )
    if not session or session.expires_at < now_utc():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"message": "Session expired or invalid."})
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"message": "Account is disabled."})
    # sliding expiry
    session.last_seen_at = now_utc()
    from datetime import timedelta

    session.expires_at = min(
        now_utc() + timedelta(minutes=settings.session_ttl_minutes),
        session.created_at + timedelta(hours=settings.session_absolute_ttl_hours),
    )
    db.commit()
    return CurrentUser(
        id=user.id,
        tenant_id=user.tenant_id,
        username=user.username,
        name=user.name,
        role=user.role,
        agent_id=user.agent_id,
        can_mark_paid=user.can_mark_paid,
    )


def require_csrf_header(request: Request) -> None:
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.headers.get("x-requested-with") != "rcgm-web":
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail={"message": "Missing CSRF header."})


def require_role(*roles: UserRole):
    def _dep(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in roles:
            raise forbidden(f"This action requires one of: {', '.join(r.value for r in roles)}.")
        return current_user

    return _dep


def require_tenant_user(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Any authenticated tenant-scoped user (excludes SUPER_ADMIN, who has no tenant)."""
    if current_user.tenant_id is None:
        raise forbidden("This action is not available to the platform administrator.")
    return current_user


def get_tenant_scope(current_user: CurrentUser = Depends(require_tenant_user)) -> uuid.UUID:
    """Returns the tenant_id every tenant-scoped query MUST filter by. The
    frontend can never override this — it is derived solely from the
    server-side session."""
    return current_user.tenant_id
